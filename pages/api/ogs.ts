// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import ogs from 'open-graph-scraper';

type Data = {
  name: string,
  results: any
}

export default async (req: NextApiRequest, res: NextApiResponse<Data>) => {
  const options = { url: 'https://www.amazon.co.uk/dp/B07ZZW7QCM/ref=gw_uk_desk_mso_smp_shl_avs_c?pf_rd_r=BS4CPJHDDZE4E8RP8BXQ&pf_rd_p=8f60aeb1-5ed2-4ed5-86eb-3c0044e732e6&pd_rd_r=521caad4-e4fc-455a-bdeb-de19afd077ea&pd_rd_w=DAe06&pd_rd_wg=nEhAS&ref_=pd_gw_unk' };
  const data = await ogs(options);
  const { error, result } = data;
  return res.status(200).json({ 
    name: 'John Doe', 
    results: result
  })
}
