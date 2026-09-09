import { AdminConsole } from './admin-console'
import { AdminContextSwitcher } from './admin-context-switcher'
import { AdminShortcuts } from './admin-shortcuts'

export default function AdminHome() {
  return <><AdminConsole/><AdminContextSwitcher/><AdminShortcuts/></>
}
