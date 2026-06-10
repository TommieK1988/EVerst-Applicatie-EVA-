import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  // Controleer of huidige gebruiker admin is
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Niet geautoriseerd' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ message: 'Alleen admins kunnen gebruikers aanmaken' }, { status: 403 })
  }

  const { email, password, full_name, role } = await request.json()

  // Gebruik service role voor aanmaken gebruiker
  const adminSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() { },
      },
    }
  )

  const { data: newUser, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  })

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 })
  }

  // Profiel bijwerken (wordt al aangemaakt via trigger, maar role instellen)
  if (newUser.user) {
    await adminSupabase
      .from('profiles')
      .update({ full_name, role })
      .eq('id', newUser.user.id)
  }

  return NextResponse.json({ user: newUser.user }, { status: 201 })
}
