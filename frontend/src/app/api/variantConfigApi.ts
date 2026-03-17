import api from './axiosInstance';

export interface VariantConfig {
  key: string;
  label: string;
  iconKey: string;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  shadowColor: string;
  isBase: boolean;
}

export async function fetchVariantConfigs(): Promise<VariantConfig[]> {
  const { data } = await api.get('/variant-configs');
  return data;
}
