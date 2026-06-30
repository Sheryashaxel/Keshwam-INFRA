'use server'

import { createClient } from '../../utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function hashString(plainText: string) {
  const msgUint8 = new TextEncoder().encode(plainText)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function generateDeviceKey(deviceId: string) {
  const supabase = await createClient()

  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  const hexSecret = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  
  const rawKey = `sl_rs1_live_${hexSecret}`
  const keyHash = await hashString(rawKey)

  const { error } = await supabase
    .from('device_keys')
    .insert({
      device_id: deviceId,
      key_hash: keyHash,
      status: 'active'
    })

  if (error) {
    console.error('Failed to provision key:', error)
    throw new Error('Database insertion failed.')
  }

  revalidatePath('/')
  return rawKey
}

export async function revokeDeviceKey(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('device_keys')
    .update({ status: 'revoked' })
    .eq('id', id)

  if (error) {
    console.error('Failed to revoke key:', error)
    throw new Error('Database update failed.')
  }

  revalidatePath('/')
}