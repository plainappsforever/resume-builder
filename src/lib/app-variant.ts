import Constants from 'expo-constants';

/** Debug controls and dev links exist only in the development variant (V1_PLAN rule 15). */
export const isDevVariant = Constants.expoConfig?.extra?.appVariant === 'development';
