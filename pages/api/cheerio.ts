// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import cheerio from 'cheerio';
import axios, { Method } from 'axios';
import psl, { ParsedDomain } from 'psl';
import puppeteer from 'puppeteer';

type Data = {
  result?: any,
  errors?: Array<any>,
  imageSearchString?: string,
  imageSearchResult?: any
}

const scrapeMetatags = async (url: string) => {
  
  let html: any;
  let errors: Array<any> = [];
  
  try {
    const res = await axios(url);
    html = res.data;
  } catch (error) {
    if (error.response) {
      // Request made and server responded
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error', error.message);
    }
    errors.push(error);
  }

  if (html) {

    const $ = cheerio.load(html);
    
    const getMetatag = (name: string) =>  
        $(`meta[name=${name}]`).attr('content') ||  
        $(`meta[name="og:${name}"]`).attr('content') || 
        $(`meta[property="og:${name}"]`).attr('content') ||  
        $(`meta[name="twitter:${name}"]`).attr('content');
  
    return {
      data: {
        url,
        title: $('title').first().text(),
        favicon: $('link[rel="shortcut icon"]').attr('href'),
        // description: $('meta[name=description]').attr('content'),
        description: getMetatag('description'),
        image: getMetatag('image'),
        author: getMetatag('author'),
        siteName: getMetatag('site_name')
      }
    }

  } else {

    // Could have additional fallbacks here (tried using puppeteer for sites such as https://www.fiverr.com/, still did not pass the robots)

    return {
      errors: errors
    }

  }
}

function extractHostname(url: string) {
  var hostname;
  //find & remove protocol (http, ftp, etc.) and get hostname

  if (url.indexOf("//") > -1) {
      hostname = url.split('/')[2];
  }
  else {
      hostname = url.split('/')[0];
  }

  //find & remove port number
  hostname = hostname.split(':')[0];
  //find & remove "?"
  hostname = hostname.split('?')[0];

  return hostname;
}

const getImageSearchString = (title: string, url: string, siteName?: string) => {
  
  const rootDomain = psl.get(extractHostname(url));
  let noRootDomain = title;
  if (rootDomain) {
    const domainSearchMask = rootDomain;
    const domainRegEx = new RegExp(domainSearchMask, 'ig');
    noRootDomain = title.replace(domainRegEx, '');
  }

  const siteNameSearchMask = siteName ? siteName : '';
  const siteNameRegEx = new RegExp(siteNameSearchMask, 'ig');
  const noSiteName = noRootDomain.replace(siteNameRegEx, '');

  const noSpecialChars = noSiteName.replace(/[&\/\\#,+()$~%.'":*?<>{}|]/g, ' ');

  const imageSearchString = noSpecialChars.trim();

  return imageSearchString;

}

const getBingImageSearchResult = async (search: string) => {
  const subscriptionKey = 'bbbfaff3366740ea82827de1a00c389c';
  const url = 'https://api.bing.microsoft.com/v7.0/images/search';
  if (search) {
    const config = {
      method : 'GET' as Method,
      url: url + '?q=' + encodeURIComponent(search),
      headers : {
      'Ocp-Apim-Subscription-Key' : subscriptionKey,
      }
    }
    const res = await axios(config);
    return res.data.value;
  } else {
    throw new Error("No search string for image");
  }
}

export default async (req: NextApiRequest, res: NextApiResponse<Data>) => {

  const targetUrl = 'https://www.amazon.co.uk/dp/B07747FR44/ref=gw_uk_mso_desk_eink_moo?pf_rd_r=89P9691SR5RH435ZNGE2&pf_rd_p=ccb08224-22f0-42a4-9d43-a6cf2e0de0e4&pd_rd_r=4cc7718c-a139-4313-8408-888841e4f0dd&pd_rd_w=nT05B&pd_rd_wg=BQU1b&ref_=pd_gw_unk'

  const result = await scrapeMetatags(targetUrl);
  if (result.data) {
    const imageSearchString = getImageSearchString(result.data.title, result.data.url, result.data.siteName);
    const imageSearchResult = await getBingImageSearchResult(imageSearchString);
    return res.status(200).json({
      result: result,
      imageSearchString: imageSearchString,
      imageSearchResult: imageSearchResult
    })
  } else {
    const rootDomain = psl.get(extractHostname(targetUrl));
    if (rootDomain) {
      const parsed = psl.parse(rootDomain);
      if (!parsed.error) {
        if (parsed.sld) {
          const imageSearchResult = await getBingImageSearchResult(parsed.sld);
          return res.status(200).json({
            errors: result.errors,
            imageSearchResult: imageSearchResult
          });
        } else {
          const errors = result.errors;
          errors.push("sld not found");
          return res.status(200).json({
            errors: errors
          });
        }
      } else {
        const errors = result.errors;
        errors.push(parsed.error);
        return res.status(200).json({
          errors: errors
        });
      }
    } else {
      const errors = result.errors;
      errors.push("root domain not found");
      return res.status(200).json({
        errors: errors
      });
    }
  }
}
