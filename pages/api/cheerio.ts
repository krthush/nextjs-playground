// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import cheerio from 'cheerio';
import axios, { Method } from 'axios';
import psl, { ParsedDomain } from 'psl';
import puppeteer from 'puppeteer-extra';
import { errors } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

type Data = {
  result?: any,
  errors?: Array<any>,
  imageSearchString?: string,
  imageUrls?: Array<string>
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

  if (!html) { // Additional fallback using stealth puppeteer for sites such as https://www.fiverr.com/sorich1/fix-bugs-and-build-any-laravel-php-and-vuejs-projects, https://www.netflix.com/gb/title/70136120

    await puppeteer.use(StealthPlugin()).launch().then(async browser => {
      const page = await browser.newPage();;
      await page.goto(url, { waitUntil: 'networkidle0' });
      html = await page.evaluate(() => document.querySelector('*')?.outerHTML);
      await browser.close();
    });

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

  // Can remove site name here for more specificity but generally leads to worse results
  // const siteNameSearchMask = siteName ? siteName : '';
  // const siteNameRegEx = new RegExp(siteNameSearchMask, 'ig');
  // const noSiteName = noRootDomain.replace(siteNameRegEx, '');

  const noSpecialChars = noRootDomain.replace(/[&\/\\#,+()$~%.'":*?<>{}|—]/g, ' ');

  const imageSearchString = noSpecialChars.trim();

  return imageSearchString;

}

const getBingImageSearch = async (search: string): Promise<{ results?: Array<any>, error?: any }> => {
  const subscriptionKey = process.env.AZURE_BING_SEARCH_KEY;
  const url = 'https://api.bing.microsoft.com/v7.0/images/search';
  if (search) {
    const config = {
      method : 'GET' as Method,
      url: url + '?q=' + encodeURIComponent(search),
      headers : {
      'Ocp-Apim-Subscription-Key' : subscriptionKey,
      }
    }
    try {
      const res = await axios(config);
      return {
        results: res.data.value
      }
    } catch (error) {
      return {
        error: error
      }
    }
  } else {
    throw new Error("No search string for image");
  }
}

const mergeImageUrls = (array1:Array<string>, array2:Array<string>) => {
  let imageUrls:Array<string> = [];
  const l = Math.min(array1.length, array2.length);    
  for (let i = 0; i < l; i++) {
    imageUrls.push(array1[i], array2[i]);
  }
  imageUrls.push(...array1.slice(l), ...array2.slice(l));
  return imageUrls;
}

export default async (req: NextApiRequest, res: NextApiResponse<Data>) => {

  const targetUrl = 'https://www.netflix.com/gb/title/70136120';

  // Get images for root domain
  let rootDomainImageUrls:Array<string> = [];
  let imageSearchString:string = "";
  let errors:Array<any> = [];
  const rootDomain = psl.get(extractHostname(targetUrl));
  if (rootDomain) {
    const parsed = psl.parse(rootDomain);
    if (!parsed.error) {
      if (parsed.sld) {
        imageSearchString = parsed.sld;
        const imageSearch = await getBingImageSearch(imageSearchString);
        if (imageSearch.results) {
          rootDomainImageUrls = imageSearch.results.map((imageResult: { contentUrl: string; }) => imageResult.contentUrl)
        } else {
          errors.push(imageSearch.error);
        }
      } else {
        throw Error("sld not found");
      }
    } else {
      throw Error(JSON.stringify(parsed.error));
    }
  } else {
    throw Error("Root domain not found");
  }

  // Get images specific to given url
  const result = await scrapeMetatags(targetUrl);

  if (result.data) {
    imageSearchString = getImageSearchString(result.data.title, result.data.url, result.data.siteName);
    if (imageSearchString) {
      const imageSearch = await getBingImageSearch(imageSearchString);
      if (imageSearch.results) { 
        const imageUrls = imageSearch.results.map((imageResult: { contentUrl: string; }) => imageResult.contentUrl);
        // Add in some of the root domain images
        imageUrls.splice(2, 0, rootDomainImageUrls[0]);
        imageUrls.splice(5, 0, rootDomainImageUrls[1]);
        imageUrls.splice(10, 0, rootDomainImageUrls[2]);
        imageUrls.splice(15, 0, rootDomainImageUrls[3]);
        imageUrls.splice(20, 0, rootDomainImageUrls[4]);
        return res.status(200).json({
          result: result,
          imageSearchString: imageSearchString,
          imageUrls: imageUrls
        })
      } else {
        // Fallback to just show root domain images if they exist and any errors
        errors.push(imageSearch.error);
        return res.status(200).json({
          errors: errors,
          imageSearchString: imageSearchString,
          imageUrls: rootDomainImageUrls
        });
      }
    } else {
      // Fallback to just show root domain images if they exist and any errors
      errors.push(result.errors);
      return res.status(200).json({
        errors: errors,
        imageSearchString: imageSearchString,
        imageUrls: rootDomainImageUrls
      });
    }
  } else {
    // Fallback to just show root domain images if they exist and any errors
    errors.push(result.errors);
    return res.status(200).json({
      errors: errors,
      imageSearchString: imageSearchString,
      imageUrls: rootDomainImageUrls
    });
  }

}
