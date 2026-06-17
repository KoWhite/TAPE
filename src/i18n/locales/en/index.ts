// English message bundle — merges per-view namespace modules.
//
// Each view owns one file here (overview.ts, watchlist.ts, …) so translation
// work on different pages never collides on a single file. Spread them all
// into one flat object; namespaces must not overlap. The zh bundle mirrors
// this file module-for-module and is type-checked against it.
//
// As each page is localized, add its namespace import here (and the matching
// one in ../zh/index.ts).
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
