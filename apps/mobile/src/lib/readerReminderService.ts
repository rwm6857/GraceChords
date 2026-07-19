import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import i18n from '../i18n'
import {
  getReaderReminder,
  REMINDER_NOTIFICATION_ID,
  setReminderEnabled,
  setReminderTime,
  syncReminder,
  type NotificationBackend,
  type ReminderContent,
} from './readerReminder'

// Native wiring for the Daily Word reminder. Keeps expo-notifications isolated
// from the pure preference/reconciliation logic in readerReminder.ts (which is
// where the testable behavior lives). This module holds only the thin adapter to
// the native module plus the app-facing flows the Settings screen and app root
// call.

const ANDROID_CHANNEL_ID = 'reader-reminders'

// The passages nudge deep-links straight to the Daily Word tab on tap.
const REMINDER_DEEP_LINK = '/daily'

/** Localized notification copy — rebuilt on each (re)schedule so it follows the
 * current UI language. */
function reminderContent(): ReminderContent {
  return {
    title: i18n.t('settings:reminder.notificationTitle'),
    body: i18n.t('settings:reminder.notificationBody'),
  }
}

/** The real backend, delegating to expo-notifications. */
const backend: NotificationBackend = {
  async getPermissionGranted() {
    try {
      const settings = await Notifications.getPermissionsAsync()
      return permissionGranted(settings)
    } catch {
      return false
    }
  },
  async requestPermission() {
    try {
      const settings = await Notifications.requestPermissionsAsync()
      return permissionGranted(settings)
    } catch {
      return false
    }
  },
  async cancel(id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id)
    } catch {
      // No-op if nothing is scheduled under this id.
    }
  },
  async scheduleDaily(id, hour, minute, content) {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: content.title,
        body: content.body,
        sound: true,
        data: { url: REMINDER_DEEP_LINK },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    })
  },
}

function permissionGranted(settings: Notifications.NotificationPermissionsStatus): boolean {
  const s = settings as unknown as {
    granted?: boolean
    status?: string
    ios?: { status?: number }
  }
  if (s.granted || s.status === 'granted') return true
  // iOS reports provisional (quiet) authorization as its own status; treat it as
  // granted since notifications will still be delivered.
  return s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
}

/**
 * Install the foreground handler (show the reminder even while the app is open)
 * and, on Android, the notification channel. Safe to call once at app start.
 */
export function initReaderReminders(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: i18n.t('settings:reminder.channelName'),
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {})
  }
}

/** Reconcile the OS schedule with the stored preference (call at launch). */
export async function syncReaderReminderOnLaunch(): Promise<void> {
  try {
    await syncReminder(getReaderReminder(), reminderContent(), backend)
  } catch {
    // Best-effort — a scheduling hiccup must never block launch.
  }
}

/**
 * Turn the reminder on: request permission (this is where iOS shows the system
 * prompt), and only persist + schedule when granted. Returns whether it was
 * granted so the UI can steer the user to Settings on denial.
 */
export async function enableReaderReminder(hour: number, minute: number): Promise<boolean> {
  const granted = await backend.requestPermission()
  if (!granted) return false
  setReminderTime(hour, minute)
  setReminderEnabled(true)
  await syncReminder(getReaderReminder(), reminderContent(), backend)
  return true
}

/** Turn the reminder off and cancel the scheduled notification. */
export async function disableReaderReminder(): Promise<void> {
  setReminderEnabled(false)
  await syncReminder(getReaderReminder(), reminderContent(), backend)
}

/** Change the reminder time and reschedule (no-op on the OS if disabled). */
export async function updateReaderReminderTime(hour: number, minute: number): Promise<void> {
  setReminderTime(hour, minute)
  await syncReminder(getReaderReminder(), reminderContent(), backend)
}

/**
 * Route to the Daily Word tab when the user taps the reminder. Returns the
 * subscription's remover. `onOpen` receives the deep-link path.
 */
export function addReminderResponseListener(onOpen: (url: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url
    if (typeof url === 'string') onOpen(url)
  })
  return () => sub.remove()
}
