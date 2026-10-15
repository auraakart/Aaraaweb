/// A fixed in-app allowlist. Source text and model output are never used as
/// navigation targets; existing screens still enforce normal authorization.
({String section, String label})? assistantDestinationForIntent(String? intent) {
  switch (intent) {
    case 'RESIDENT_HOUSEHOLD':
      return (section: 'profile', label: 'Open Profile');
    case 'RESIDENT_VEHICLES':
      return (section: 'profile', label: 'Open Profile');
    case 'RESIDENT_PARCELS':
      return (section: 'parcels', label: 'Open Parcels');
    case 'RESIDENT_NOTICES':
      return (section: 'notices', label: 'Open Notices');
    case 'RESIDENT_REQUESTS':
      return (section: 'helpdesk', label: 'Open Helpdesk');
    default:
      return null;
  }
}
