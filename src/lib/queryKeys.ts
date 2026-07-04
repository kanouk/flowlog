export const queryKeys = {
  entries: (userId: string) => ['entries', userId] as const,
  entry: (userId: string, date: string) => ['entries', userId, date] as const,
  blocksByDate: (userId: string, date: string) => ['blocks', userId, 'date', date] as const,
  blocksByCategory: (userId: string, category: string, filters?: object) =>
    ['blocks', userId, 'category', category, filters] as const,
  customTags: (userId: string) => ['customTags', userId] as const,
  aiApiKeys: (userId: string) => ['aiApiKeys', userId] as const,
  aiModels: (userId: string) => ['aiModels', userId] as const,
  aiFeatureSettings: (userId: string) => ['aiFeatureSettings', userId] as const,
  apiTokens: (userId: string) => ['apiTokens', userId] as const,
  imageStorageSettings: (userId: string) => ['imageStorageSettings', userId] as const,
  topTags: (userId: string) => ['topTags', userId] as const,
};
