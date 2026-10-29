import { RawMaterialsPanel } from '@/components/raw/RawMaterialsPanel'
import { rawFlags, rawUser } from '@/lib/raw/server'
export const dynamic = 'force-dynamic'
export default async function RawPage() { const user = await rawUser(); return <div className="p-4 sm:p-6"><RawMaterialsPanel flags={rawFlags()} canWrite={user.role !== 'viewer'} /></div> }
