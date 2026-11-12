import LatLon from 'geodesy/latlon-spherical.js';

const ARRIVAL_RADIUS_M = 100;

// Steers the boat along waypoints on great circles at a given speed.
// No current or leeway: heading == course over ground, STW == SOG.
export class Simulation {
    constructor(waypoints) {
        this.setWaypoints(waypoints);
    }

    setWaypoints(waypoints) {
        this.waypoints = (waypoints || []).filter(w => Number.isFinite(w.lat) && Number.isFinite(w.lon));
        this.reset();
    }

    // Boat at the first waypoint, heading for the second.
    reset() {
        const first = this.waypoints[0];
        const second = this.waypoints[1];
        this.targetIndex = this.waypoints.length > 1 ? 1 : 0;
        this.finished = this.waypoints.length < 2;
        this.boat = {
            lat: first?.lat ?? 0,
            lon: first?.lon ?? 0,
            heading: first && second ? new LatLon(first.lat, first.lon).initialBearingTo(new LatLon(second.lat, second.lon)) : 0,
            speed_mps: 0
        };
    }

    // Advance by dtSeconds at speedMps. Returns the new boat state.
    step(dtSeconds, speedMps) {
        if (this.finished) {
            this.boat = { ...this.boat, speed_mps: 0 };
            return this.boat;
        }

        let remaining = Math.max(0, speedMps) * dtSeconds;
        let here = new LatLon(this.boat.lat, this.boat.lon);
        let heading = this.boat.heading;

        // Move along the route, rolling over waypoints reached within this step.
        while (remaining > 0 || here.distanceTo(this.target()) < ARRIVAL_RADIUS_M) {
            const target = this.target();
            const distance = here.distanceTo(target);
            if (distance < ARRIVAL_RADIUS_M || distance <= remaining) {
                remaining -= Math.min(remaining, distance);
                here = target;
                if (this.targetIndex >= this.waypoints.length - 1) {
                    this.finished = true;
                    break;
                }
                this.targetIndex++;
                continue;
            }
            heading = here.initialBearingTo(target);
            here = here.destinationPoint(remaining, heading);
            remaining = 0;
        }

        if (!this.finished) heading = here.initialBearingTo(this.target());

        this.boat = {
            lat: here.lat,
            lon: here.lon,
            heading: Number.isFinite(heading) ? heading : this.boat.heading,
            speed_mps: this.finished ? 0 : speedMps
        };
        return this.boat;
    }

    target() {
        const wp = this.waypoints[this.targetIndex];
        return new LatLon(wp.lat, wp.lon);
    }
}
