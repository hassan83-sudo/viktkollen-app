export function getReadyGreetingPeriod(date = new Date()) {
  const hour = date instanceof Date ? date.getHours() : new Date().getHours()
  if (hour < 5) return 'evening'
  if (hour < 11) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function getReadyGreetingKey(date = new Date()) {
  return `greeting.${getReadyGreetingPeriod(date)}`
}
