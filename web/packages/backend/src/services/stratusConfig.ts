import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runtimeConfig } from '../runtimeConfig.js';

export const DEFAULT_STRATUS_BASE_URL = 'https://api.gtpstratus.com/v1';
export const STRATUS_START_DATE_FIELD_NAME = 'STRATUS.Field.SMC_Package Start Date';
export const STRATUS_FINISH_DATE_FIELD_NAME = 'STRATUS.Field.SMC_Package Estimated Finish Date';

export interface StratusConfig {
  baseUrl: string;
  appKey: string;
  companyId: string;
  startDateFieldIdOverride: string;
  finishDateFieldIdOverride: string;
  cachedStartDateFieldId: string;
  cachedFinishDateFieldId: string;
}

export interface SafeStratusConfig {
  baseUrl: string;
  appKeySet: boolean;
  companyId: string;
  startDateFieldIdOverride: string;
  finishDateFieldIdOverride: string;
  cachedStartDateFieldId: string;
  cachedFinishDateFieldId: string;
}

const DEFAULT_CONFIG: StratusConfig = {
  baseUrl: DEFAULT_STRATUS_BASE_URL,
  appKey: '',
  companyId: '',
  startDateFieldIdOverride: '',
  finishDateFieldIdOverride: '',
  cachedStartDateFieldId: '',
  cachedFinishDateFieldId: '',
};

const CONFIG_PATH = runtimeConfig.stratusConfigPath;

let cachedConfig: StratusConfig | null = null;

export function getStratusConfig(): StratusConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    if (existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<StratusConfig>;
      cachedConfig = normalizeStratusConfig(parsed);
      return cachedConfig;
    }
  } catch {
    // Ignore config parse failures and fall back to defaults.
  }

  cachedConfig = normalizeStratusConfig();
  return cachedConfig;
}

export function setStratusConfig(partial: Partial<StratusConfig>): StratusConfig {
  const nextConfig = normalizeStratusConfig({
    ...getStratusConfig(),
    ...partial,
  });
  cachedConfig = nextConfig;
  writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
  return nextConfig;
}

export function getSafeStratusConfig(): SafeStratusConfig {
  const config = getStratusConfig();
  return {
    baseUrl: config.baseUrl,
    appKeySet: config.appKey.length > 0,
    companyId: config.companyId,
    startDateFieldIdOverride: config.startDateFieldIdOverride,
    finishDateFieldIdOverride: config.finishDateFieldIdOverride,
    cachedStartDateFieldId: config.cachedStartDateFieldId,
    cachedFinishDateFieldId: config.cachedFinishDateFieldId,
  };
}

export function normalizeStratusConfig(raw?: Partial<StratusConfig> | null): StratusConfig {
  return {
    baseUrl: normalizeBaseUrl(raw?.baseUrl),
    appKey: normalizeOptionalString(raw?.appKey) ?? '',
    companyId: normalizeOptionalString(raw?.companyId) ?? '',
    startDateFieldIdOverride: normalizeOptionalString(raw?.startDateFieldIdOverride) ?? '',
    finishDateFieldIdOverride: normalizeOptionalString(raw?.finishDateFieldIdOverride) ?? '',
    cachedStartDateFieldId: normalizeOptionalString(raw?.cachedStartDateFieldId) ?? '',
    cachedFinishDateFieldId: normalizeOptionalString(raw?.cachedFinishDateFieldId) ?? '',
  };
}

export function normalizeBaseUrl(baseUrl?: string | null): string {
  const trimmed = normalizeOptionalString(baseUrl);
  return (trimmed ?? DEFAULT_STRATUS_BASE_URL).replace(/\/+$/, '');
}

export function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function ensureStratusConfigured(config: StratusConfig): void {
  if (!config.appKey) {
    throw new Error('Stratus app key is not configured.');
  }
}
