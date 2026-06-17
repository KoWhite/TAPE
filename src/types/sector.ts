export interface SectorInfo {
  sector: string | null
  industry: string | null
  marketCap: number | null
}

export interface SectorResponse {
  available: boolean
  results: Record<string, SectorInfo>
  cachedAt: string
}
