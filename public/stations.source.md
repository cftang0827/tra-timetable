# stations.json Source

`public/stations.json` is copied from the official Taiwan Railway station dataset.

- Dataset: 臺鐵車站基本資料集
- Dataset ID: 33425
- Provider: 國營臺灣鐵路股份有限公司
- Official dataset page: https://data.gov.tw/dataset/33425
- Official JSON download: https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/0518b833e8964d53bfea3f7691aea0ee

Update flow:

1. Download the official JSON.
2. Replace `public/stations.json`.
3. Run `npm run generate:station-regions`.
4. Run `npm run check:stations`.

`public/data/meta/stationRegions.json` is the app-facing station metadata. It is
generated from `public/stations.json` and includes region, English name,
addresses, phone number, and parsed GPS coordinates.
