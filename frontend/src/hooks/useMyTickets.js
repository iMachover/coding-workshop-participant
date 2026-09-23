import { listMyTickets } from '../services/ticketService'
import useApiData from './useApiData'

/**
 * The caller's tickets for the given filters (see ticketService.listMyTickets).
 * Older requests are cancelled; previous tickets stay visible while re-fetching.
 * @param {object} [filters]
 * @returns {{tickets: object[], loading: boolean, error: Error | null, reload: () => void}}
 */
export default function useMyTickets(filters = {}) {
  const { data, loading, error, reload } = useApiData(listMyTickets, filters)
  return { tickets: data ?? [], loading, error, reload }
}
