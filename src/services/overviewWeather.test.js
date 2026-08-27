import { describe, expect, it } from 'vitest'
import { defaultWeatherLocation, mapOpenMeteoWeather } from './overviewWeather.js'

describe('overviewWeather', () => {
  it('defaults to Helsingborg coordinates', () => {
    expect(defaultWeatherLocation).toMatchObject({
      city: 'Helsingborg',
      latitude: 56.0467,
      longitude: 12.6945,
    })
  })

  it('maps Open-Meteo payload into live weather facts without fake zeros', () => {
    const weather = mapOpenMeteoWeather({
      current: {
        precipitation_probability: 20,
        temperature_2m: 17.4,
        time: '2026-08-21T12:00:00',
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
      updatedAt: '2026-08-21T12:00:00',
    })
    expect(weather.city).toBe('Din plats')
    expect(weather.sunriseLabel).toMatch(/\d{2}:\d{2}/)
    expect(weather.feelsLikeC).toBeNull()
    expect(weather.hourly).toEqual([])
  })

  it('maps hourly forecast entries without inventing values', () => {
    const weather = mapOpenMeteoWeather({
      current: { temperature_2m: 12, weather_code: 0, wind_speed_10m: 2 },
      hourly: {
        precipitation_probability: [10, null],
        temperature_2m: [12.2, Number.NaN],
        time: ['2026-08-21T13:00:00', '2026-08-21T14:00:00'],
        uv_index: [4.2, 5],
        weather_code: [0, 1],
        wind_speed_10m: [2.1, 3],
      },
    }, 'Helsingborg')

    expect(weather.city).toBe('Helsingborg')
    expect(weather.hourly).toHaveLength(1)
    expect(weather.hourly[0]).toMatchObject({
      precipitationRiskPercent: 10,
      temperatureC: 12.2,
      uvIndex: 4.2,
      windSpeedMs: 2.1,
    })
  })

  it('keeps a named city when mapping live weather', () => {
    const weather = mapOpenMeteoWeather({
      current: { temperature_2m: 12, weather_code: 0, wind_speed_10m: 2 },
    }, 'Helsingborg')

    expect(weather.city).toBe('Helsingborg')
    expect(weather.hasLiveWeather).toBe(true)
  })

  it('keeps disconnected weather when temperature is missing', () => {
    expect(mapOpenMeteoWeather({ current: {} }).hasLiveWeather).toBe(false)
  })
})
