import * as Notifications from 'expo-notifications';

// A push that arrives while the app is open still shows the OS banner: alerts are never silent.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
