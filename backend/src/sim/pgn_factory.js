// Field values for the PGNs the simulation computes from the boat's motion.
// Field names must match the canboat definition Names exactly and use the
// definition's units; the encoder silently drops unknown names.

// PGNs whose values the simulation owns (overwritten every tick).
// 128259's "Speed Water Referenced" is also the boat-speed input.
export const SIMULATED_PGNS = ['129029', '126992', '129025', '129026', '128259'];

function daysSinceEpoch(t) {
    return Math.floor(t.getTime() / 86400000);
}

function secondsSinceMidnight(t) {
    return t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds() + t.getUTCMilliseconds() / 1000;
}

const DEG = Math.PI / 180;

export function simulatedValues(boat, t = new Date()) {
    return {
        // GNSS Position Data
        '129029': {
            Date: daysSinceEpoch(t),
            Time: Math.floor(secondsSinceMidnight(t)),
            Latitude: boat.lat,
            Longitude: boat.lon,
            'GNSS type': 0,        // GPS
            Method: 1,             // GNSS fix
            Integrity: 0,
            'Number of SVs': 10,
            HDOP: 1.0,
            PDOP: 1.0
        },
        // Position, Rapid Update
        '129025': {
            Latitude: boat.lat,
            Longitude: boat.lon
        },
        // COG & SOG, Rapid Update
        '129026': {
            'COG Reference': 0,    // True
            COG: boat.heading * DEG,
            SOG: boat.speed_mps
        },
        // System Time (Time in seconds)
        '126992': {
            Source: 0,             // GPS
            Date: daysSinceEpoch(t),
            Time: secondsSinceMidnight(t)
        },
        // Speed
        '128259': {
            'Speed Water Referenced': boat.speed_mps,
            'Speed Ground Referenced': boat.speed_mps
        }
    };
}
