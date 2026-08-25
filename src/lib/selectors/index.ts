export * from './baseAtualSelectors'
export {
  parseCityUf,
  formatStoreIdentity,
  formatStoreIdentityTable,
  buildStoreCompositeKey,
  extractStoreRealCode,
  extractStoreCleanName,
  deriveNetworkName,
  normalizeNetworkName,
  formatCityUf,
  formatProductSku,
  isRealNumericStoreCode,
  cleanCode,
  type StoreIdentityInput,
} from '@/lib/format/storeIdentity'
export {
  normalizeStoreCode,
  formatStoreCode,
  normalizeStoreCodeForMatching,
} from '@/lib/format/storeCode'
