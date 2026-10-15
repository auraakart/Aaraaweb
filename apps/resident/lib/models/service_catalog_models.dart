class ServiceProviderSummary {
  const ServiceProviderSummary({
    required this.businessName,
    this.description,
    this.ratingAverage,
    this.ratingCount = 0,
    this.completedJobs = 0,
    this.societyTrusted = false,
    this.societyCompletedJobs = 0,
    this.societyRatingAverage,
    this.societyRatingCount = 0,
    this.societyCancellationRate,
    this.societyOnTimeRate,
    this.societyArrivalSamples = 0,
  });

  final String businessName;
  final String? description;
  final double? ratingAverage;
  final int ratingCount;
  final int completedJobs;
  final bool societyTrusted;
  final int societyCompletedJobs;
  final double? societyRatingAverage;
  final int societyRatingCount;
  final double? societyCancellationRate;
  final double? societyOnTimeRate;
  final int societyArrivalSamples;

  factory ServiceProviderSummary.fromJson(Map<String, dynamic> json) => ServiceProviderSummary(
        businessName: json['businessName']?.toString() ?? 'Verified provider',
        description: _optional(json['description']),
        ratingAverage: (json['ratingAverage'] as num?)?.toDouble(),
        ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
        completedJobs: (json['completedJobs'] as num?)?.toInt() ?? 0,
        societyTrusted: json['societyTrusted'] == true,
        societyCompletedJobs: (json['societyCompletedJobs'] as num?)?.toInt() ?? 0,
        societyRatingAverage: (json['societyRatingAverage'] as num?)?.toDouble(),
        societyRatingCount: (json['societyRatingCount'] as num?)?.toInt() ?? 0,
        societyCancellationRate: (json['societyCancellationRate'] as num?)?.toDouble(),
        societyOnTimeRate: (json['societyOnTimeRate'] as num?)?.toDouble(),
        societyArrivalSamples: (json['societyArrivalSamples'] as num?)?.toInt() ?? 0,
      );
}

class ServiceCategorySummary {
  const ServiceCategorySummary({required this.id, required this.name});
  final String id;
  final String name;

  factory ServiceCategorySummary.fromJson(Map<String, dynamic> json) =>
      ServiceCategorySummary(id: json['id']?.toString() ?? '', name: json['name']?.toString() ?? '');
}

class ServiceOfferingSummary {
  const ServiceOfferingSummary({
    required this.raw,
    required this.id,
    required this.categoryId,
    required this.name,
    required this.pricePaise,
    required this.provider,
    required this.category,
    this.description,
    this.durationMinutes,
  });

  final Map<String, dynamic> raw;
  final String id;
  final String categoryId;
  final String name;
  final String? description;
  final int pricePaise;
  final int? durationMinutes;
  final ServiceProviderSummary provider;
  final ServiceCategorySummary category;

  static ServiceOfferingSummary? tryParse(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final categoryId = json['categoryId']?.toString() ?? '';
    final name = json['name']?.toString() ?? '';
    final providerRaw = json['provider'];
    final categoryRaw = json['category'];
    if (id.isEmpty || categoryId.isEmpty || name.isEmpty || providerRaw is! Map) return null;
    return ServiceOfferingSummary(
      raw: Map<String, dynamic>.unmodifiable(json),
      id: id,
      categoryId: categoryId,
      name: name,
      description: _optional(json['description']),
      pricePaise: (json['pricePaise'] as num?)?.toInt() ?? 0,
      durationMinutes: (json['durationMinutes'] as num?)?.toInt(),
      provider: ServiceProviderSummary.fromJson(Map<String, dynamic>.from(providerRaw)),
      category: categoryRaw is Map
          ? ServiceCategorySummary.fromJson(Map<String, dynamic>.from(categoryRaw))
          : ServiceCategorySummary(id: categoryId, name: ''),
    );
  }

  String get searchText => [
        name,
        description,
        provider.businessName,
        provider.description,
        category.name,
      ].whereType<String>().join(' ').toLowerCase();
}

String? _optional(dynamic value) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? null : text;
}
