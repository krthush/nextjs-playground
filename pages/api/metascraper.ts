// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import got from 'got';

const metascraper = require('metascraper')([
  require('metascraper-amazon')(),
  require('@samirrayani/metascraper-shopping')(),
  require('metascraper-description')(),
  require('metascraper-title')(),
])

type Data = {
  results: any
}

export default async (req: NextApiRequest, res: NextApiResponse<Data>) => {
  const targetUrl = 'https://www.amazon.co.uk/dp/B07ZZW7QCM/ref=gw_uk_desk_mso_smp_shl_avs_c?pf_rd_r=BS4CPJHDDZE4E8RP8BXQ&pf_rd_p=8f60aeb1-5ed2-4ed5-86eb-3c0044e732e6&pd_rd_r=521caad4-e4fc-455a-bdeb-de19afd077ea&pd_rd_w=DAe06&pd_rd_wg=nEhAS&ref_=pd_gw_unk'

  const { body: html, url } = await got(targetUrl)
  const metadata = await metascraper({ html, url })
  console.log(metadata)

  return res.status(200).json({ 
    results: metadata
  })
}
