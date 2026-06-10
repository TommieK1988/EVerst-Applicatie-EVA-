/** ULU API response-types — gematcht op daadwerkelijke API (17-apr-2026). */

/**
 * Login-response:
 *   { success, errors, access_token: { access_token: "..." }, user: {...}, current_company: {...}, roles, brand, can_select_company }
 */
export type UluSession = {
  access_token?: string | { access_token?: string }
  user?: {
    access_token?: string | { access_token?: string }
    id?: number
    email?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Voertuig uit GET /vehicles.
 * Response-envelope: { success, vehicles: [...] }
 */
export type UluVehicle = {
  id: number
  license_plate: string | null
  make?: string | null           // Merk (bv. "Ford")
  model?: string | null          // Model (bv. "TRANSIT CONNECT")
  modelyear?: number | null
  vehicle_type?: string | null
  vehicle_class?: string | null
  color?: string | null
  enginetype?: string | null
  transmission?: string | null
  seating?: number | null
  vin?: string | null
  device_id?: number | null
  name?: string | null
  state?: string | null
  country?: string | null
  trip_score?: string | null
  updated_odometer_at?: string | null
  [key: string]: unknown
}

/**
 * Trip uit GET /vehicles/{id}/trips.
 * Response-envelope: { success, trips, total_pages, current_page, has_more }
 */
export type UluTrip = {
  id: number
  vehicle_id: number
  device_id?: number | null
  user_id?: number | null
  company_id?: number | null
  device_owner_id?: number | null
  privacy?: string | null        // 'business' | 'private' | 'commute' | ...
  trip_type_id?: number | null   // 1=?, 2=business, ... (gebruik privacy als autoritair)
  created_at?: string | null
  updated_at?: string | null
  // Tijdstippen (lokale tijd "YYYY-MM-DD HH:MM:SS.mmm"; utc_* heeft UTC ISO)
  start_at: string
  stop_at?: string | null
  utc_start_at?: string | null
  utc_stop_at?: string | null
  // Metingen
  duration?: number | null         // seconden
  idle_duration?: number | null    // seconden
  distance?: number | null         // meters
  distance_electric?: number | null
  max_speed?: number | null        // km/h
  avg_speed?: string | null        // km/h als string
  odometer_start?: number | null   // meters
  odometer_stop?: number | null    // meters
  // Adres-fragmenten
  start_road_name?: string | null
  start_road_place?: string | null
  start_road_country?: string | null
  stop_road_name?: string | null
  stop_road_place?: string | null
  stop_road_country?: string | null
  // Score
  score?: string | null            // "0.0"–"1.0" als string
  notes?: string | null
  [key: string]: unknown
}

export type UluVehiclesResponse = {
  success?: boolean
  vehicles?: UluVehicle[]
}

export type UluTripsResponse = {
  success?: boolean
  trips?: UluTrip[]
  total_pages?: number
  current_page?: number
  has_more?: boolean
}

/** Gebruiker uit GET /users. */
export type UluUser = {
  id: number
  firstname?: string | null
  lastname?: string | null
  name?: string | null        // Volledige naam (firstname + lastname), vaak al samengesteld
  email?: string | null
  middle_name?: string | null
  initials?: string | null
  [key: string]: unknown
}

/** CompanyUser uit GET /company_users — koppeling user ↔ voertuig. */
export type UluCompanyUser = {
  id: number
  user?: UluUser
  current_vehicle?: { id?: number; license_plate?: string | null } | null
  deleted?: boolean
  has_app_access?: boolean
  available?: boolean
  [key: string]: unknown
}
