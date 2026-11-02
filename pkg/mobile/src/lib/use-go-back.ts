import { type Href, router, useNavigation } from 'expo-router';

/**
 * Back to the screen beneath this one in its stack, as the iOS edge swipe and Android's back go. A screen with
 * nothing beneath it goes to `fallback` instead.
 */
export function useGoBack(fallback: Href) {
  const navigation = useNavigation();
  return () => {
    if ((navigation.getState()?.index ?? 0) > 0) navigation.goBack();
    else router.replace(fallback);
  };
}
