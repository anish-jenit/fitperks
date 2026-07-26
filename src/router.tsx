import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type RouterLocation = {
  pathname: string
  search: string
  hash: string
}

type RouterContextValue = {
  location: RouterLocation
  navigate: (to: string, options?: { replace?: boolean }) => void
}

type RouteElement = React.ReactElement<{ path: string; element: React.ReactNode }>

const RouterContext = createContext<RouterContextValue | null>(null)
const RouteParamsContext = createContext<Record<string, string>>({})

function getLocation(): RouterLocation {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }
}

function normalizeTo(to: string) {
  return to || '/'
}

function matchPath(pattern: string, pathname: string) {
  if (pattern === '*') return {}

  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index]
    const pathPart = pathParts[index]
    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart)
      continue
    }
    if (patternPart !== pathPart) return null
  }

  return params
}

export function BrowserRouter({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState(getLocation)

  useEffect(() => {
    const handlePopState = () => setLocation(getLocation())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const next = normalizeTo(to)
    if (options?.replace) {
      window.history.replaceState(null, '', next)
    } else {
      window.history.pushState(null, '', next)
    }
    setLocation(getLocation())
    window.scrollTo({ top: 0 })
  }, [])

  const value = useMemo<RouterContextValue>(() => ({
    location,
    navigate,
  }), [location, navigate])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function Routes({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const routeElements = React.Children.toArray(children).filter(React.isValidElement) as RouteElement[]

  for (const route of routeElements) {
    const nextParams = matchPath(route.props.path, router.location.pathname)
    if (nextParams) {
      return <RouteParamsContext.Provider value={nextParams}>{route.props.element}</RouteParamsContext.Provider>
    }
  }

  return null
}

export function Route(_: { path: string; element: React.ReactNode }) {
  return null
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate()
  useEffect(() => {
    navigate(to, { replace })
  }, [navigate, replace, to])
  return null
}

export function Link({ to, children, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const navigate = useNavigate()

  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event)
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey ||
          props.target
        ) {
          return
        }
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

export function useLocation() {
  return useRouter().location
}

export function useNavigate() {
  return useRouter().navigate
}

export function useParams() {
  return useContext(RouteParamsContext)
}

export function useSearchParams() {
  const { search } = useLocation()
  return [useMemo(() => new URLSearchParams(search), [search])] as const
}

function useRouter() {
  const router = useContext(RouterContext)
  if (!router) throw new Error('Router hooks must be used inside BrowserRouter')
  return router
}
