// 简体中文 message bundle — mirrors ../en/index.ts module-for-module.
// Each namespace file is type-checked against its English counterpart.
import shell from './shell'
import settings from './settings'
import overview from './overview'
import watchlist from './watchlist'
import movers from './movers'
import heatmap from './heatmap'
import alerts from './alerts'
import earnings from './earnings'
import screener from './screener'
import compare from './compare'
import indicators from './indicators'

export default {
  ...shell,
  ...settings,
  ...overview,
  ...watchlist,
  ...movers,
  ...heatmap,
  ...alerts,
  ...earnings,
  ...screener,
  ...compare,
  ...indicators,
}
