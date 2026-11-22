type Notification = { object_type?: string; object_id?: string | number }
type Alarm = { id?: string | number; severity?: string }
type Preferences = { criticalOnly?: boolean; quietStart?: string; quietEnd?: string }

export function shouldAlertNotification(notification: Notification, alarms: Alarm[], preferences: Preferences, now = new Date()): boolean {
  const highRisk = notification.object_type === 'ALARM' && notification.object_id != null && alarms.some(alarm => alarm.id != null && String(alarm.id) === String(notification.object_id) && alarm.severity === 'HIGH')
  if (preferences.criticalOnly && !highRisk) return false
  const toMinute = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    return (hours || 0) * 60 + (minutes || 0)
  }
  const minute = now.getHours() * 60 + now.getMinutes()
  const start = toMinute(preferences.quietStart || '22:00')
  const end = toMinute(preferences.quietEnd || '07:00')
  const quiet = start === end ? false : start < end ? minute >= start && minute < end : minute >= start || minute < end
  return !quiet || highRisk
}
