# DMARC-WallOfShame [![Deploy Pages](https://github.com/jkerai1/DMARC-WallOfShame/actions/workflows/pages.yml/badge.svg)](https://github.com/jkerai1/DMARC-WallOfShame/actions/workflows/pages.yml) [![DMARC Check (scheduled)](https://github.com/jkerai1/DMARC-WallOfShame/actions/workflows/dmarc-check-cron.yml/badge.svg)](https://github.com/jkerai1/DMARC-WallOfShame/actions/workflows/dmarc-check-cron.yml)
List of companies who do not implement DMARC controls to keep their own organisation and their customers safe with DMARC. ```p=none``` is a temporary measure and your domain should not be ```p=none``` forever. 

> [!TIP]
> This is only for educational purposes to spread the awareness of DMARC importance. The term "Wall of shame" is used humorously and descriptively in the context of cybersecurity awareness culture and is not intended to defame, disparage, or harm any organization. The prescence of a domain does not imply misconduct or compromise. Results are based only on publicly observable DNS records at the time of the Github Action run which is on a cron.

Tracks domains that:
- Have no DMARC record
- Have DMARC policy set to p=none

## How it works

- Daily GitHub Action checks domains. If the company remediates then they get cleared down.
- Updates `docs/non_dmarc.json`
- GitHub Pages serves the console UI from `docs/index.html`. Edit the readable source assets (`docs/css/*.css`, `docs/js/*.js`), then run `node scripts/minify_assets.mjs` to refresh the `.min.css` and `.min.js` files used by the pages. The Pages workflow runs this before deploy.

## Local development

```bash
node scripts/minify_assets.mjs
python3 -m http.server 8123 --directory docs
```

Then open `http://127.0.0.1:8123/`.

After changing `docs/css/*.css` or `docs/js/*.js`, rerun:

```bash
node scripts/minify_assets.mjs
```

## Contributing

Add domains to:
`data/companies.json`

> Smaller players will not be accepted due to the fact it will flood the site. Large companies by Revenue (or Employee/Customer count), Government Entities, Software with a huge supply chain that could cause an supply chain attack,an Alexa top 1M domain (or equivalent ranking), IT/security companies that should know better, a company that holds signficant PII or is involved in significant infrastructure that if hacked would cause physical destruction or loss of life will be Accepted to the list.


> [!NOTE]
> Even if your domain is not intended to send email it should still have DMARC of p=reject and be parked, for example, v=spf1 -all which permits no IP to send mail. Follow Guidance here: https://www.ncsc.gov.uk/blog-post/protecting-parked-domains
 
> [!NOTE]
> Also Note if your company uses Entra/Microsoft 365 you still need to DMARC your .onmicrosoft.com domain. https://o365info.com/dkim-dmarc-onmicrosoft-com-domain/. This repo will not include .onmicrosoft.com domains.
