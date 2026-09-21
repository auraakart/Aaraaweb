class ServiceProviderSummary {
  const ServiceProviderSummary({
    required this.businessName,
    this.description,
    this.ratingAverage,
    this.ratingCount = 0,
    this.completedJobs = 0,
  });

  final String businessName;
  final String? description;
  final double? ratingAverage;
  final int ratingCount;
  final int completedJobs;

  factory ServiceProviderSummary.fromJson(Map<String, dynamic> json) => ServiceProviderSummary(
        businessName: json['businessName']?.toString() ?? 'Verified provider',
        description: _optional(json['description']),
        ratingAverage: (json['ratingAverage'] as num?)?.toDouble(),
        ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
        completedJobs: (json['completedJobs'] as num?)?.toInt() ?? 0,
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
