import { City, Reader } from '@maxmind/geoip2-node'
import { Plugin, PluginMeta } from '@posthog/plugin-scaffold'
// @ts-ignore
import { createPageview, resetMeta } from '@posthog/plugin-scaffold/test/utils'
import { join } from 'path'

import * as index from '.'

const { processEvent } = index as Required<Plugin>

const DEFAULT_MMDB_FILE_NAME = 'GeoLite2-City-Test.mmdb'

async function resetMetaWithMmdb(
    transformResult = (res: City) => res as Record<string, any>,
    file = DEFAULT_MMDB_FILE_NAME
): Promise<PluginMeta> {
    const mmdb = await Reader.open(join(__dirname, file))
    return resetMeta({
        geoip: {
            locate: (ipAddress: string) => {
                const res = mmdb.city(ipAddress)
                return transformResult(res)
            },
        },
    }) as PluginMeta
}

test('event is enriched with IP location', async () => {
    const event = await processEvent({ ...createPageview(), ip: '89.160.20.129' }, await resetMetaWithMmdb())
    expect(event!.properties).toEqual(
        expect.objectContaining({
            $geoip_city_name: 'Linköping',
            $geoip_country_name: 'Sweden',
            $geoip_country_code: 'SE',
            $geoip_continent_name: 'Europe',
            $geoip_continent_code: 'EU',
            $geoip_time_zone: 'Europe/Stockholm',
            $geoip_subdivision_1_code: 'E',
            $geoip_subdivision_1_name: 'Östergötland County',
        })
    )
})

test('person is enriched with IP location', async () => {
    const event = await processEvent({ ...createPageview(), ip: '89.160.20.129' }, await resetMetaWithMmdb())
    expect(event!.properties!.$set).toEqual(
        expect.objectContaining({
            $geoip_city_name: 'Linköping',
            $geoip_country_name: 'Sweden',
            $geoip_country_code: 'SE',
            $geoip_continent_name: 'Europe',
            $geoip_continent_code: 'EU',
            $geoip_time_zone: 'Europe/Stockholm',
            $geoip_subdivision_1_code: 'E',
            $geoip_subdivision_1_name: 'Östergötland County',
        })
    )
    expect(event!.properties!.$set_once).toEqual(
        expect.objectContaining({
            $initial_geoip_city_name: 'Linköping',
            $initial_geoip_country_name: 'Sweden',
            $initial_geoip_country_code: 'SE',
            $initial_geoip_continent_name: 'Europe',
            $initial_geoip_continent_code: 'EU',
            $initial_geoip_time_zone: 'Europe/Stockholm',
            $initial_geoip_subdivision_1_code: 'E',
            $initial_geoip_subdivision_1_name: 'Östergötland County',
        })
    )
})

test('person props default to null if no values present', async () => {
    const removeCityNameFromLookupResult = (res: City) => {
        const { city, ...remainingResult } = res
        return remainingResult
    }
    const event = await processEvent(
        { ...createPageview(), ip: '89.160.20.129' },
        await resetMetaWithMmdb(removeCityNameFromLookupResult)
    )
    expect(event!.properties!.$set).toEqual({
        $geoip_city_name: null, // default to null
        $geoip_country_name: 'Sweden',
        $geoip_country_code: 'SE',
        $geoip_continent_name: 'Europe',
        $geoip_continent_code: 'EU',
        $geoip_time_zone: 'Europe/Stockholm',
        $geoip_subdivision_1_code: 'E',
        $geoip_subdivision_1_name: 'Östergötland County',
        $geoip_subdivision_2_code: null,
        $geoip_subdivision_2_name: null,
        $geoip_postal_code: null,
    })
    expect(event!.properties!.$set_once).toEqual({
        $initial_geoip_city_name: null, // default to null
        $initial_geoip_country_name: 'Sweden',
        $initial_geoip_country_code: 'SE',
        $initial_geoip_continent_name: 'Europe',
        $initial_geoip_continent_code: 'EU',
        $initial_geoip_time_zone: 'Europe/Stockholm',
        $initial_geoip_subdivision_1_code: 'E',
        $initial_geoip_subdivision_1_name: 'Östergötland County',
        $initial_geoip_subdivision_2_code: null,
        $initial_geoip_subdivision_2_name: null,
        $initial_geoip_postal_code: null,
    })
})

test('error is thrown if meta.geoip is not provided', async () => {
    expect.assertions(1)
    await expect(
        async () => await processEvent({ ...createPageview(), ip: '89.160.20.129' }, resetMeta())
    ).rejects.toEqual(
        new Error('This PostHog version does not have GeoIP capabilities! Upgrade to PostHog 1.24.0 or later')
    )
})

test('event is skipped using $geoip_disable', async () => {
    const testEvent = { ...createPageview(), ip: '89.160.20.129', properties: { $geoip_disable: true } }
    const processedEvent = await processEvent(JSON.parse(JSON.stringify(testEvent)), await resetMetaWithMmdb())
    expect(testEvent).toEqual(processedEvent)
})
