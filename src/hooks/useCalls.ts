import { useEffect, useState } from 'react'
import { dataProvider } from '../data/dataProvider'
import type { Call } from '../types'

/** Real, model-scored calls — used by supervisor Overview / Call summaries. */
export function useCalls() {
  const [calls, setCalls] = useState<Call[] | null>(null)

  useEffect(() => {
    let cancelled = false
    dataProvider.getRealCalls().then((c) => {
      if (!cancelled) setCalls(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return calls
}

/** Real calls scoped to the logged-in agent — used by the agent's "My calls" page. */
export function useMyCalls() {
  const [calls, setCalls] = useState<Call[] | null>(null)

  useEffect(() => {
    let cancelled = false
    dataProvider.getMyCalls().then((c) => {
      if (!cancelled) setCalls(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return calls
}

/** Synthetic scripted demo calls — Live agent-assist replay only. */
export function useScriptedCalls() {
  const [calls, setCalls] = useState<Call[] | null>(null)

  useEffect(() => {
    let cancelled = false
    dataProvider.getScriptedCalls().then((c) => {
      if (!cancelled) setCalls(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return calls
}
