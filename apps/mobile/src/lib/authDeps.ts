// The one native-importing glue layer for the auth flows: builds the injected
// deps objects that authFlows.ts consumes. Kept free of logic so everything
// testable lives in authFlows.ts (this file is covered by device testing).
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import type { AppleDeps, GoogleDeps } from './authFlows'
import { supabase } from './supabase'

export function makeAppleDeps(): AppleDeps {
  return {
    supabase,
    signInAsync: (hashedNonce) =>
      AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      }),
    sha256: (value) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
    randomUUID: () => Crypto.randomUUID(),
    isCancelError: (e) =>
      typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ERR_REQUEST_CANCELED',
  }
}

export function makeGoogleDeps(): GoogleDeps {
  return {
    supabase,
    configure: () =>
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      }),
    signIn: async () => {
      const result = await GoogleSignin.signIn()
      // v13+ returns { type: 'success' | 'cancelled', data }; treat a
      // user-cancelled response like the coded cancel error.
      if (result.type === 'cancelled') {
        const cancel = new Error('Sign-in cancelled') as Error & { code: string }
        cancel.code = statusCodes.SIGN_IN_CANCELLED
        throw cancel
      }
      return { idToken: result.data?.idToken ?? null }
    },
    isCancelError: (e) =>
      isErrorWithCode(e) &&
      (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS),
    isPlayServicesError: (e) =>
      isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
    // DEVELOPER_ERROR is not part of the public `statusCodes`; the Android
    // native module rejects with the raw CommonStatusCodes.DEVELOPER_ERROR
    // value ("10"). It means the app's package + signing SHA-1 aren't registered
    // against an Android OAuth client in webClientId's Google Cloud project.
    isConfigError: (e) => isErrorWithCode(e) && e.code === '10',
  }
}
