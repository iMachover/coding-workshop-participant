import { listAllTickets } from '../services/adminTicketService'
import useApiData from './useApiData'

/**
 * Every ticket matching the filters, for the Facility Admin (see adminTicketService.listAllTickets).
 * Older requests are cancelled; previous tickets stay visible while re-fetching.
 * @param {object} [filters]
 * @returns {{tickets: object[], loading: boolean, error: Error | null, reload: () => void}}
 */
export default function useAllTickets(filters = {}) {
  const { data, loading, error, reload } = useApiData(listAllTickets, filters)
  return { tickets: data ?? [], loading, error, reload }
}
