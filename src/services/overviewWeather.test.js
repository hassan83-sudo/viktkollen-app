import { describe, expect, it } from 'vitest'
import { mapOpenMeteoWeather } from './overviewWeather.js'

describe('overviewWeather', () => {
  it('maps Open-Meteo payload into live weather facts without fake zeros', () => {
    const weather = mapOpenMeteoWeather({
      current: {
        precipitation_probability: 20,
        temperature_2m: 17.4,
        weather_code: 1,
        wind_speed_10m: 3.2,
      },
      daily: {
        sunrise: ['2026-08-21T05:41:00'],
        sunset: ['2026-08-21T20:12:00'],
      },
    })

    expect(weather).toMatchObject({
      condition: 'Mestadels klart',
      hasLiveWeather: true,
      sourceLabel: 'Open-Meteo',
      temperatureC: 17.4,
    })
    expect(weather.city).toBe('Din plats')
    expect(weather.sunriseLabel).toMatch(/\d{2}:\d{2}/)
    expect(weather.feelsLikeC).toBeNull()
  })

  it('keeps a named city when mapping live weather', () => {
    const weather = mapOpenMeteoWeather({
      current: { temperature_2m: 12, weather_code: 0, wind_speed_10m: 2 },
    }, 'Stockholm')

    expect(weather.city).toBe('Stockholm')
    expect(weather.hasLiveWeather).toBe(true)
  })

  it('keeps disconnected weather when temperature is missing', () => {
    expect(mapOpenMeteoWeather({ current: {} }).hasLiveWeather).toBe(false)
  })
})
