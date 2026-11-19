import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { NewsArticle, Service } from '../types';

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => (await api.get<Service[]>('/services')).data,
  });
}

export function useService(slug: string | undefined) {
  return useQuery({
    queryKey: ['service', slug],
    enabled: Boolean(slug),
    queryFn: async () => (await api.get<Service>(`/services/${slug}`)).data,
  });
}

export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn: async () => (await api.get<NewsArticle[]>('/news')).data,
  });
}

export function useArticle(slug: string | undefined) {
  return useQuery({
    queryKey: ['news', slug],
    enabled: Boolean(slug),
    queryFn: async () => (await api.get<NewsArticle>(`/news/${slug}`)).data,
  });
}

export function useSiteSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<Record<string, string>>('/settings')).data,
  });
}
