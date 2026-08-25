import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabaseClient'
import { Account, Payout, Trade } from '../lib/types'
import { useAuth } from './AuthContext'

interface DataCtx {
  loading: boolean
  accounts: Account[]
  trades: Trade[]
  payouts: Payout[]
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  addAccount: (a: Omit<Account, 'user_id' | 'created_at' | 'id'>) => Promise<void>
  updateAccount: (a: Account) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  addTrade: (t: Omit<Trade, 'user_id' | 'created_at' | 'id'>) => Promise<void>
  updateTrade: (t: Trade) => Promise<void>
  deleteTrade: (id: string) => Promise<void>
  addPayout: (p: Omit<Payout, 'user_id' | 'created_at' | 'id'>) => Promise<void>
  updatePayout: (p: Payout) => Promise<void>
  deletePayout: (id: string) => Promise<void>
}

const DataContext = createContext<DataCtx | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer2 = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)

  const userId = user?.id ?? null

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setAccounts([])
      setTrades([])
      setPayouts([])
      return
    }
    let active = true
    setLoading(true)
    ;(async () => {
      const [acctRes, tradeRes, payoutRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('trades').select('*').eq('user_id', userId).order('date', { ascending: true }),
        supabase.from('payouts').select('*').eq('user_id', userId).order('date', { ascending: true }),
      ])
      if (!active) return
      if (!acctRes.error) setAccounts((acctRes.data as Account[]) ?? [])
      if (!tradeRes.error) setTrades((tradeRes.data as Trade[]) ?? [])
      if (!payoutRes.error) setPayouts((payoutRes.data as Payout[]) ?? [])
      setLoading(false)
    })()

    const acctChannel = supabase
      .channel('realtime-accounts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe()

    const tradeChannel = supabase
      .channel('realtime-trades')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe()

    const payoutChannel = supabase
      .channel('realtime-payouts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payouts', filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe()

    async function refresh() {
      const [acctG, tradeG, payoutG] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', userId),
        supabase.from('trades').select('*').eq('user_id', userId).order('date', { ascending: true }),
        supabase.from('payouts').select('*').eq('user_id', userId).order('date', { ascending: true }),
      ])
      if (!isMounted.current) return
      if (!acctG.error) setAccounts((acctG.data as Account[]) ?? [])
      if (!tradeG.error) setTrades((tradeG.data as Trade[]) ?? [])
      if (!payoutG.error) setPayouts((payoutG.data as Payout[]) ?? [])
    }

    return () => {
      active = false
      supabase.removeChannel(acctChannel)
      supabase.removeChannel(tradeChannel)
      supabase.removeChannel(payoutChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const markDirty = useCallback(() => {
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (saveTimer2.current) clearTimeout(saveTimer2.current)
    saveTimer.current = setTimeout(() => {
      if (isMounted.current) setSaveState('saved')
    }, 1500)
    saveTimer2.current = setTimeout(() => {
      if (isMounted.current) setSaveState('idle')
    }, 4500)
  }, [])

  const onError = useCallback(() => {
    if (isMounted.current) setSaveState('error')
  }, [])

  const addAccount = useCallback(
    async (a: Omit<Account, 'user_id' | 'created_at' | 'id'>) => {
      if (!userId) return
      const { data, error } = await supabase
        .from('accounts')
        .insert({ ...a, user_id: userId })
        .select()
        .single()
      if (error) {
        onError()
        throw new Error(error.message)
      }
      setAccounts((prev) => [...prev, data as Account])
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const updateAccount = useCallback(
    async (a: Account) => {
      if (!userId) return
      setAccounts((prev) => prev.map((x) => (x.id === a.id ? a : x)))
      const { error } = await supabase
        .from('accounts')
        .update(a)
        .eq('id', a.id)
        .eq('user_id', userId)
      if (error) {
        onError()
        throw new Error(error.message)
      }
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const deleteAccount = useCallback(
    async (id: string) => {
      if (!userId) return
      await supabase.from('trades').delete().eq('account_id', id).eq('user_id', userId)
      await supabase.from('payouts').delete().eq('account_id', id).eq('user_id', userId)
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) {
        onError()
        throw new Error(error.message)
      }
      setAccounts((prev) => prev.filter((x) => x.id !== id))
      setTrades((prev) => prev.filter((x) => x.account_id !== id))
      setPayouts((prev) => prev.filter((x) => x.account_id !== id))
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const addTrade = useCallback(
    async (t: Omit<Trade, 'user_id' | 'created_at' | 'id'>) => {
      if (!userId) return
      const { data, error } = await supabase
        .from('trades')
        .insert({ ...t, user_id: userId })
        .select()
        .single()
      if (error) {
        onError()
        throw new Error(error.message)
      }
      setTrades((prev) => [...prev, data as Trade])
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const updateTrade = useCallback(
    async (t: Trade) => {
      if (!userId) return
      setTrades((prev) => prev.map((x) => (x.id === t.id ? t : x)))
      const { error } = await supabase
        .from('trades')
        .update(t)
        .eq('id', t.id)
        .eq('user_id', userId)
      if (error) {
        onError()
        throw new Error(error.message)
      }
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const deleteTrade = useCallback(
    async (id: string) => {
      if (!userId) return
      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) {
        onError()
        throw new Error(error.message)
      }
      setTrades((prev) => prev.filter((x) => x.id !== id))
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const addPayout = useCallback(
    async (p: Omit<Payout, 'user_id' | 'created_at' | 'id'>) => {
      if (!userId) return
      const { data, error } = await supabase
        .from('payouts')
        .insert({ ...p, user_id: userId })
        .select()
        .single()
      if (error) {
        onError()
        throw new Error(error.message)
      }
      setPayouts((prev) => [...prev, data as Payout])
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const updatePayout = useCallback(
    async (p: Payout) => {
      if (!userId) return
      setPayouts((prev) => prev.map((x) => (x.id === p.id ? p : x)))
      const { error } = await supabase
        .from('payouts')
        .update(p)
        .eq('id', p.id)
        .eq('user_id', userId)
      if (error) {
        onError()
        throw new Error(error.message)
      }
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const deletePayout = useCallback(
    async (id: string) => {
      if (!userId) return
      const { error } = await supabase
        .from('payouts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) {
        onError()
        throw new Error(error.message)
      }
      setPayouts((prev) => prev.filter((x) => x.id !== id))
      markDirty()
    },
    [userId, markDirty, onError],
  )

  const value = useMemo<DataCtx>(
    () => ({
      loading,
      accounts,
      trades,
      payouts,
      saveState,
      addAccount,
      updateAccount,
      deleteAccount,
      addTrade,
      updateTrade,
      deleteTrade,
      addPayout,
      updatePayout,
      deletePayout,
    }),
    [
      loading,
      accounts,
      trades,
      payouts,
      saveState,
      addAccount,
      updateAccount,
      deleteAccount,
      addTrade,
      updateTrade,
      deleteTrade,
      addPayout,
      updatePayout,
      deletePayout,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataCtx {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
