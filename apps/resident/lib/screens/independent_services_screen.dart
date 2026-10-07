import 'dart:async';
import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../data/push_registration_service.dart';
import '../data/resident_repository.dart';
import 'consumer_booking_screen.dart';
import 'consumer_bookings_screen.dart';
import 'provider_storefront_sheet.dart';
import 'service_history_screen.dart';

class IndependentServicesScreen extends StatefulWidget {
  const IndependentServicesScreen({super.key, required this.apiClient, this.onSignOut, this.independentMode = true});

  final ApiClient apiClient;
  final Future<void> Function()? onSignOut;
  final bool independentMode;

  @override
  State<IndependentServicesScreen> createState() => _IndependentServicesScreenState();
}

class _IndependentServicesScreenState extends State<IndependentServicesScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _categories = const [];
  List<Map<String, dynamic>> _offerings = const [];
  List<Map<String, dynamic>> _locations = const [];
  List<Map<String, dynamic>> _recentProviders = const [];
  List<Map<String, dynamic>> _communityDeals = const [];
  Set<String> _favoriteProviderIds = const {};
  bool _communityDealBusy = false;
  String? _selectedCategoryId;
  String? _selectedLocationKey;
  PushRegistrationService? _push;
  final TextEditingController _searchController = TextEditingController();
  String _query = '';

  Map<String, dynamic>? get _selectedLocation {
    final key = _selectedLocationKey;
    if (key == null) return null;
    for (final location in _locations) {
      if (_locationKey(location) == key) return location;
    }
    return null;
  }

  List<Map<String, dynamic>> get _visibleOfferings {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return _offerings;
    return _offerings.where((offering) {
      final provider = offering['provider'] as Map<String, dynamic>? ?? const {};
      final category = offering['category'] as Map<String, dynamic>? ?? const {};
      final searchable = [
        offering['name'],
        offering['description'],
        offering['categoryName'],
        offering['providerName'],
        category['name'],
        provider['businessName'],
        provider['description'],
      ].whereType<Object>().map((value) => value.toString().toLowerCase()).join(' ');
      return searchable.contains(query);
    }).toList();
  }

  List<Map<String, dynamic>> get _recentProviderOfferings {
    final firstOfferingByProvider = <String, Map<String, dynamic>>{};
    for (final offering in _offerings) {
      final provider = offering['provider'] as Map<String, dynamic>? ?? const {};
      final providerId = offering['providerId']?.toString() ?? provider['id']?.toString();
      if (providerId != null && providerId.isNotEmpty) {
        firstOfferingByProvider.putIfAbsent(providerId, () => offering);
      }
    }
    return _recentProviders
        .map((provider) => firstOfferingByProvider[provider['providerId']?.toString()])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  String _locationKey(Map<String, dynamic> location) => '${location['type']}:${location['id']}';

  @override
  void initState() {
    super.initState();
    if (widget.independentMode) {
      _push = PushRegistrationService(ResidentRepository(widget.apiClient));
      unawaited(_push!.start(onOpened: _handlePushOpened));
    }
    _load();
  }

  Future<void> _handlePushOpened(Map<String, dynamic> data) async {
    if (!mounted || data['type']?.toString() != 'CONSUMER_SERVICE_BOOKING_STATUS') return;
    await _openMyBookings();
  }

  Future<void> _signOut() async {
    await _push?.stop();
    await widget.onSignOut?.call();
  }

  Future<void> _load([String? categoryId]) async {
    setState(() {
      _loading = true;
      _error = null;
      _selectedCategoryId = categoryId;
    });
    try {
      final categoriesRaw = await widget.apiClient.get('/api/v1/consumer/services/categories');
      final locationsRaw = await widget.apiClient.get('/api/v1/consumer/services/locations');
      List<dynamic> trustRaw = const [];
      List<dynamic> favoritesRaw = const [];
      List<dynamic> recentProvidersRaw = const [];
      try {
        final raw = await widget.apiClient.get('/api/v1/consumer/services/providers/trust');
        trustRaw = raw as List<dynamic>? ?? const [];
      } catch (_) {
        // Trust metadata is informational and must never block discovery.
      }
      try {
        final raw = await widget.apiClient.get('/api/v1/consumer/services/favorites');
        favoritesRaw = raw as List<dynamic>? ?? const [];
      } catch (_) {
        // Favourites are optional and must never block service discovery.
      }
      try {
        final raw = await widget.apiClient.get('/api/v1/consumer/services/recent-providers');
        recentProvidersRaw = raw as List<dynamic>? ?? const [];
      } catch (_) {
        // Recent-provider memory is optional and must never block discovery.
      }
      final locations = (locationsRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      final trustByProvider = <String, Map<String, dynamic>>{};
      for (final trust in trustRaw.whereType<Map<String, dynamic>>()) {
        final providerId = trust['providerId']?.toString();
        if (providerId != null && providerId.isNotEmpty) trustByProvider[providerId] = trust;
      }
      final favoriteIds = favoritesRaw
          .whereType<Map<String, dynamic>>()
          .map((item) => item['providerId']?.toString())
          .whereType<String>()
          .toSet();
      final recentProviders = recentProvidersRaw.whereType<Map<String, dynamic>>().toList();

      String? selectedKey = _selectedLocationKey;
      if (selectedKey == null || !locations.any((item) => _locationKey(item) == selectedKey && item['serviceAddressConfigured'] != false)) {
        for (final location in locations) {
          if (location['serviceAddressConfigured'] != false) {
            selectedKey = _locationKey(location);
            break;
          }
        }
      }

      List<Map<String, dynamic>> offerings = const [];
      List<Map<String, dynamic>> communityDeals = const [];
      if (selectedKey != null) {
        final location = locations.firstWhere((item) => _locationKey(item) == selectedKey);
        final params = <String, String>{
          'locationType': location['type'].toString(),
          'locationId': location['id'].toString(),
          if (categoryId != null) 'categoryId': categoryId,
        };
        final raw = await widget.apiClient.get('/api/v1/consumer/services/offerings?${Uri(queryParameters: params).query}');
        offerings = (raw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().map((offering) {
          final provider = Map<String, dynamic>.from(offering['provider'] as Map? ?? const {});
          final providerId = offering['providerId']?.toString() ?? provider['id']?.toString();
          final trust = providerId == null ? null : trustByProvider[providerId];
          if (provider['societyRatingAverage'] is num) {
            provider['ratingAverage'] = provider['societyRatingAverage'];
            provider['ratingCount'] = provider['societyRatingCount'];
            provider['completedJobs'] = provider['societyCompletedJobs'];
          } else if (trust != null) {
            provider['ratingAverage'] = trust['averageStars'];
            provider['ratingCount'] = trust['ratingCount'];
            provider['completedJobs'] = trust['completedJobs'];
          }
          return <String, dynamic>{...offering, 'provider': provider};
        }).toList();
        if (location['type']?.toString() == 'SOCIETY_UNIT') {
          try {
            final dealQuery = Uri(queryParameters: {
              'locationType': location['type'].toString(),
              'locationId': location['id'].toString(),
            }).query;
            final dealsRaw = await widget.apiClient.get('/api/v1/consumer/services/community-deals?$dealQuery');
            communityDeals = (dealsRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
          } catch (_) {
            // Community deals are additive and must never block core service discovery.
          }
        }
      }
      if (!mounted) return;
      setState(() {
        _categories = (categoriesRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _locations = locations;
        _selectedLocationKey = selectedKey;
        _offerings = offerings;
        _recentProviders = recentProviders;
        _communityDeals = communityDeals;
        _favoriteProviderIds = favoriteIds;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _selectLocation(String? key) async {
    if (key == null) return;
    setState(() => _selectedLocationKey = key);
    await _load(_selectedCategoryId);
  }

  Future<void> _setCommunityDeal(Map<String, dynamic> deal, bool join) async {
    final location = _selectedLocation;
    final campaignId = deal['id']?.toString();
    if (location == null || location['type']?.toString() != 'SOCIETY_UNIT' || campaignId == null) return;
    setState(() => _communityDealBusy = true);
    try {
      final action = join ? 'join' : 'withdraw';
      await widget.apiClient.post('/api/v1/consumer/services/community-deals/$campaignId/$action', {
        'locationType': location['type'],
        'locationId': location['id'],
      });
      await _load(_selectedCategoryId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(join ? 'Joined this community service deal.' : 'Community service deal participation withdrawn.')),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _communityDealBusy = false);
    }
  }

  Future<void> _openBooking(Map<String, dynamic> offering) async {
    final location = _selectedLocation;
    if (location == null) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ConsumerBookingScreen(apiClient: widget.apiClient, offering: offering, initialLocation: location),
    ));
  }

  Future<void> _setFavorite(String providerId, bool active) async {
    await widget.apiClient.put('/api/v1/consumer/services/favorites/$providerId', {'active': active});
    if (!mounted) return;
    setState(() {
      final next = Set<String>.from(_favoriteProviderIds);
      if (active) {
        next.add(providerId);
      } else {
        next.remove(providerId);
      }
      _favoriteProviderIds = next;
    });
  }

  Future<void> _openProviderStorefront(Map<String, dynamic> offering) async {
    final location = _selectedLocation;
    final provider = offering['provider'] as Map<String, dynamic>? ?? const {};
    final providerId = offering['providerId']?.toString() ?? provider['id']?.toString();
    Map<String, dynamic>? experience;
    if (location != null && providerId != null && providerId.isNotEmpty) {
      try {
        final params = Uri(queryParameters: {
          'locationType': location['type'].toString(),
          'locationId': location['id'].toString(),
        }).query;
        final raw = await widget.apiClient.get('/api/v1/consumer/services/providers/$providerId/experience?$params');
        if (raw is Map) experience = Map<String, dynamic>.from(raw);
      } catch (_) {
        // Rich storefront content is optional; core verified provider info remains usable.
      }
    }
    if (!mounted) return;
    await ProviderStorefrontSheet.show(
      context,
      offering: offering,
      experience: experience,
      isFavorite: providerId != null && _favoriteProviderIds.contains(providerId),
      onFavoriteChanged: providerId == null ? null : (active) => _setFavorite(providerId, active),
      onBook: () => unawaited(_openBooking(offering)),
    );
  }

  Future<void> _openServiceHistory() async {
    final location = _selectedLocation;
    if (location == null || !mounted) return;
    final offeringsById = <String, Map<String, dynamic>>{
      for (final offering in _offerings)
        if (offering['id'] != null) offering['id'].toString(): offering,
    };
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ServiceHistoryScreen(
        apiClient: widget.apiClient,
        location: location,
        offeringsById: offeringsById,
        onRebook: _openBooking,
      ),
    ));
  }

  Future<void> _openMyBookings() async {
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ConsumerBookingsScreen(apiClient: widget.apiClient)));
  }

  @override
  void dispose() {
    _searchController.dispose();
    _push?.dispose();
    _push = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visibleOfferings = _visibleOfferings;
    final recentProviderOfferings = _recentProviderOfferings;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.independentMode ? 'External Services' : 'Insta Services'),
        actions: [
          IconButton(tooltip: 'Service history', onPressed: _selectedLocation == null ? null : _openServiceHistory, icon: const Icon(Icons.history_rounded)),
          IconButton(tooltip: 'My bookings', onPressed: _openMyBookings, icon: const Icon(Icons.event_note_rounded)),
          if (widget.onSignOut != null) IconButton(tooltip: 'Sign out', onPressed: _signOut, icon: const Icon(Icons.logout_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(_selectedCategoryId),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      backgroundColor: theme.colorScheme.primaryContainer,
                      foregroundColor: theme.colorScheme.onPrimaryContainer,
                      child: Icon(widget.independentMode ? Icons.home_rounded : Icons.apartment_rounded),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.independentMode ? 'Services for your home' : 'Insta Services near you', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 4),
                          Text(
                            widget.independentMode
                                ? 'Tell us what you need, then choose from trusted providers serving your address.'
                                : 'Tell us what you need and compare trusted local providers serving your selected property.',
                            style: theme.textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(onPressed: _openMyBookings, icon: const Icon(Icons.event_note_rounded), label: const Text('My bookings')),
                              OutlinedButton.icon(onPressed: _selectedLocation == null ? null : _openServiceHistory, icon: const Icon(Icons.history_rounded), label: const Text('Service history')),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                labelText: 'What do you need help with?',
                hintText: 'Try “AC repair”, “plumber” or “cleaning”',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _query = '');
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
                border: const OutlineInputBorder(),
              ),
              onChanged: (value) => setState(() => _query = value),
            ),
            const SizedBox(height: 18),
            Text('Service location', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            if (_locations.isEmpty && !_loading)
              const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('No service location is available yet. Open a service to add a home address.')))
            else
              RadioGroup<String>(
                groupValue: _selectedLocationKey,
                onChanged: _selectLocation,
                child: Column(
                  children: [
                    for (final location in _locations)
                      RadioListTile<String>(
                        value: _locationKey(location),
                        enabled: !_loading && location['serviceAddressConfigured'] != false,
                        title: Text(location['label']?.toString() ?? 'Service location', style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(location['serviceAddressConfigured'] == false
                            ? 'Society service address is not configured yet.'
                            : '${location['addressLine1'] ?? ''}, ${location['locality'] ?? ''}, ${location['city'] ?? ''}'),
                        secondary: Icon(location['type'] == 'SOCIETY_UNIT' ? Icons.apartment_rounded : Icons.home_rounded),
                      ),
                  ],
                ),
              ),
            if (_communityDeals.isNotEmpty) ...[
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(child: Text('Community deals', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
                  const Icon(Icons.groups_2_outlined),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Join neighbours for a society service day and unlock the published resident price when the household threshold is met.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 10),
              for (final deal in _communityDeals) ...[
                _CommunityDealCard(
                  deal: deal,
                  busy: _communityDealBusy,
                  onJoin: () => _setCommunityDeal(deal, true),
                  onWithdraw: () => _setCommunityDeal(deal, false),
                ),
                const SizedBox(height: 10),
              ],
            ],
            const SizedBox(height: 16),
            Text('Service categories', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: const Text('All'), selected: _selectedCategoryId == null, onSelected: (_) => _load())),
                  for (final category in _categories)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(category['name']?.toString() ?? 'Service'),
                        selected: _selectedCategoryId == category['id']?.toString(),
                        onSelected: (_) => _load(category['id']?.toString()),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            if (_loading)
              const Padding(padding: EdgeInsets.symmetric(vertical: 36), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
                const Icon(Icons.cloud_off_rounded),
                const SizedBox(height: 8),
                Text(_error!, textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(onPressed: () => _load(_selectedCategoryId), child: const Text('Retry')),
              ])))
            else if (_selectedLocation == null)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Choose or add a service location to find providers serving your area.')))
            else if (_offerings.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No verified providers currently serve this location for the selected category.')))
            else if (visibleOfferings.isEmpty)
              Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(children: [
                const Icon(Icons.search_off_rounded),
                const SizedBox(height: 8),
                Text('No services match “${_query.trim()}”.', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () { _searchController.clear(); setState(() => _query = ''); }, child: const Text('Clear search')),
              ])))
            else ...[
              if (_query.trim().isEmpty && recentProviderOfferings.isNotEmpty) ...[
                Text('Used recently', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final offering in recentProviderOfferings)
                      ActionChip(
                        avatar: const Icon(Icons.history_rounded, size: 18),
                        label: Text(
                          ((offering['provider'] as Map<String, dynamic>?)?['businessName'] ?? offering['providerName'] ?? 'Provider').toString(),
                        ),
                        onPressed: () => _openProviderStorefront(offering),
                      ),
                  ],
                ),
                const SizedBox(height: 18),
              ],
              Text(_query.trim().isEmpty ? 'Available services' : '${visibleOfferings.length} matching service${visibleOfferings.length == 1 ? '' : 's'}', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              for (final offering in visibleOfferings) ...[
                _OfferingCard(
                  offering: offering,
                  isFavorite: _favoriteProviderIds.contains(offering['providerId']?.toString() ?? (offering['provider'] as Map?)?['id']?.toString()),
                  onTap: () => _openBooking(offering),
                  onProviderTap: () => _openProviderStorefront(offering),
                ),
                const SizedBox(height: 10),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _CommunityDealCard extends StatelessWidget {
  const _CommunityDealCard({
    required this.deal,
    required this.busy,
    required this.onJoin,
    required this.onWithdraw,
  });

  final Map<String, dynamic> deal;
  final bool busy;
  final VoidCallback onJoin;
  final VoidCallback onWithdraw;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final joined = deal['joinedByThisHome'] == true;
    final open = deal['status']?.toString() == 'OPEN';
    final joinedHomes = (deal['joinedHomes'] as num?)?.toInt() ?? 0;
    final threshold = (deal['thresholdHomes'] as num?)?.toInt() ?? 0;
    final thresholdMet = deal['thresholdMet'] == true;
    final residentPricePaise = (deal['residentPricePaise'] as num?)?.toInt() ?? 0;
    final normalPricePaise = (deal['normalPricePaise'] as num?)?.toInt() ?? residentPricePaise;
    final serviceDate = DateTime.tryParse(deal['serviceDate']?.toString() ?? '')?.toLocal();
    String money(int paise) => '₹${(paise / 100).toStringAsFixed(paise % 100 == 0 ? 0 : 2)}';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(child: Icon(Icons.groups_2_outlined)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(deal['title']?.toString() ?? 'Society Service Day', style: const TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 3),
                    Text('${deal['offeringName'] ?? 'Service'} · ${deal['providerName'] ?? 'Provider'}', style: theme.textTheme.bodySmall),
                  ]),
                ),
                Text(money(residentPricePaise), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              ],
            ),
            if (deal['description']?.toString().trim().isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(deal['description'].toString()),
            ],
            const SizedBox(height: 10),
            Wrap(spacing: 10, runSpacing: 8, children: [
              _TrustSignal(icon: Icons.home_work_outlined, text: '$joinedHomes / $threshold homes'),
              if (thresholdMet) const _TrustSignal(icon: Icons.check_circle_outline_rounded, text: 'Threshold met'),
              if (serviceDate != null)
                _TrustSignal(icon: Icons.calendar_month_outlined, text: MaterialLocalizations.of(context).formatMediumDate(serviceDate)),
              if (normalPricePaise > residentPricePaise)
                _TrustSignal(icon: Icons.savings_outlined, text: 'Normal ${money(normalPricePaise)}'),
            ]),
            const SizedBox(height: 10),
            Text(
              'Joining records household interest only. A service booking and gate access are created separately.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            if (joined && open)
              OutlinedButton.icon(onPressed: busy ? null : onWithdraw, icon: const Icon(Icons.undo_rounded), label: const Text('Withdraw'))
            else if (joined)
              const Text('Joined · campaign locked', style: TextStyle(fontWeight: FontWeight.w700))
            else
              FilledButton.icon(
                onPressed: busy || !open ? null : onJoin,
                icon: const Icon(Icons.group_add_outlined),
                label: Text(open ? 'Join deal' : 'Deal locked'),
              ),
          ],
        ),
      ),
    );
  }
}

class _OfferingCard extends StatelessWidget {
  const _OfferingCard({required this.offering, required this.onTap, required this.onProviderTap, required this.isFavorite});
  final Map<String, dynamic> offering;
  final VoidCallback onTap;
  final VoidCallback onProviderTap;
  final bool isFavorite;

  @override
  Widget build(BuildContext context) {
    final provider = offering['provider'] as Map<String, dynamic>? ?? const {};
    final category = offering['category'] as Map<String, dynamic>? ?? const {};
    final pricePaise = (offering['pricePaise'] as num?)?.toInt() ?? 0;
    final price = pricePaise / 100;
    final ratingAverage = (provider['ratingAverage'] as num?)?.toDouble();
    final ratingCount = (provider['ratingCount'] as num?)?.toInt() ?? 0;
    final completedJobs = (provider['completedJobs'] as num?)?.toInt() ?? 0;
    final societyTrusted = provider['societyTrusted'] == true;
    final experiencePolicy = offering['experiencePolicy'] is Map
        ? Map<String, dynamic>.from(offering['experiencePolicy'] as Map)
        : const <String, dynamic>{};
    final targetArrivalMinutes = (experiencePolicy['targetArrivalMinutes'] as num?)?.toInt();
    final recurringAvailable = experiencePolicy['recurrenceCadences'] is List
        && (experiencePolicy['recurrenceCadences'] as List).isNotEmpty;
    final providerName = provider['businessName'] ?? offering['providerName'] ?? 'Verified provider';
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CircleAvatar(child: Icon(Icons.handyman_rounded)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w800))),
                    if (isFavorite) const Icon(Icons.favorite_rounded, size: 18),
                  ]),
                  const SizedBox(height: 4),
                  TextButton.icon(
                    onPressed: onProviderTap,
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 34), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                    icon: const Icon(Icons.storefront_rounded, size: 16),
                    label: Text('$providerName · ${category['name'] ?? offering['categoryName'] ?? 'Service'}'),
                  ),
                  const SizedBox(height: 6),
                  Wrap(spacing: 10, runSpacing: 6, children: [
                    if (ratingAverage != null && ratingCount > 0) _TrustSignal(icon: Icons.star_rounded, text: '${ratingAverage.toStringAsFixed(1)} · $ratingCount rating${ratingCount == 1 ? '' : 's'}'),
                    if (completedJobs > 0) _TrustSignal(icon: Icons.task_alt_rounded, text: '$completedJobs completed'),
                    const _TrustSignal(icon: Icons.verified_rounded, text: 'Verified'),
                    if (societyTrusted) const _TrustSignal(icon: Icons.shield_rounded, text: 'Society Trusted'),
                    if (experiencePolicy['quickServiceEligible'] == true && targetArrivalMinutes != null)
                      _TrustSignal(icon: Icons.bolt_rounded, text: 'Quick ~$targetArrivalMinutes min'),
                    if (recurringAvailable) const _TrustSignal(icon: Icons.event_repeat_rounded, text: 'Recurring'),
                  ]),
                ]),
              ),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('₹${price.toStringAsFixed(price.truncateToDouble() == price ? 0 : 2)}', style: const TextStyle(fontWeight: FontWeight.w900)),
                const Icon(Icons.chevron_right_rounded),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

class _TrustSignal extends StatelessWidget {
  const _TrustSignal({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 15),
      const SizedBox(width: 3),
      Text(text, style: Theme.of(context).textTheme.bodySmall),
    ]);
  }
}
