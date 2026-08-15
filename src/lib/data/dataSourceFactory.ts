import type { IOperationalDataSource } from './operationalDataSource'
import { MockOperationalAdapter } from './mockAdapter'

// Future adapter stubs - ready for toggle via VITE_DATA_SOURCE without touching any UI component

export class ExcelOperationalAdapter extends MockOperationalAdapter {
  // Stub for future Excel spreadsheet ingestion
  override async getKpis() {
    console.warn(
      '[ExcelOperationalAdapter] Carregamento via Excel ainda em desenvolvimento. Usando fallback.',
    )
    return super.getKpis()
  }
}

export class TradeProApiAdapter extends MockOperationalAdapter {
  // Stub for future TradePro API integration
  override async getKpis() {
    console.warn(
      '[TradeProApiAdapter] Integração TradePro API ainda em desenvolvimento. Usando fallback.',
    )
    return super.getKpis()
  }
}

export class SkipCloudOperationalAdapter extends MockOperationalAdapter {
  // Stub for future Skip Cloud operational collections
  override async getKpis() {
    console.warn(
      '[SkipCloudOperationalAdapter] Coleções operacionais no Skip Cloud em desenvolvimento. Usando fallback.',
    )
    return super.getKpis()
  }
}

let activeInstance: IOperationalDataSource | null = null

export class DataSourceFactory {
  static getProvider(): IOperationalDataSource {
    if (activeInstance) {
      return activeInstance
    }

    const dataSourceType = (import.meta.env.VITE_DATA_SOURCE || 'mock').toLowerCase()

    switch (dataSourceType) {
      case 'excel':
        activeInstance = new ExcelOperationalAdapter()
        break
      case 'tradepro':
      case 'api':
        activeInstance = new TradeProApiAdapter()
        break
      case 'skipcloud':
      case 'pocketbase':
        activeInstance = new SkipCloudOperationalAdapter()
        break
      case 'mock':
      default:
        activeInstance = new MockOperationalAdapter()
        break
    }

    return activeInstance
  }

  // Utility to override provider in testing/dev
  static setProvider(provider: IOperationalDataSource) {
    activeInstance = provider
  }

  static reset() {
    activeInstance = null
  }
}
