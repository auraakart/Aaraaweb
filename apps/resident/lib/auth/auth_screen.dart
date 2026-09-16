import 'package:flutter/material.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/premium_ui.dart';
import 'auth_repository.dart';
import 'resident_auth_controller.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.controller});
  final ResidentAuthController controller;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _phone = TextEditingController(text: '+91');
  final _otp = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final theme = Theme.of(context);
        final scheme = theme.colorScheme;
        return Scaffold(
          body: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AaraagateTokens.pageGutter,
                  AaraagateTokens.space8,
                  AaraagateTokens.pageGutter,
                  AaraagateTokens.space8,
                ),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 76,
                          height: 76,
                          decoration: BoxDecoration(
                            color: scheme.primaryContainer,
                            borderRadius: BorderRadius.circular(AaraagateTokens.radiusSheet),
                          ),
                          child: Icon(Icons.shield_rounded, size: 38, color: scheme.onPrimaryContainer),
                        ),
                      ),
                      const SizedBox(height: AaraagateTokens.space5),
                      Text(
                        'Welcome to Aaraagate',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: AaraagateTokens.space2),
                      Text(
                        'Secure access to your home, community and services.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: AaraagateTokens.space6),
                      PremiumSurface(
                        elevated: true,
                        padding: const EdgeInsets.all(AaraagateTokens.space5),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (controller.step == ResidentAuthStep.loading)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: AaraagateTokens.space6),
                                child: Center(child: CircularProgressIndicator()),
                              ),
                            if (controller.step == ResidentAuthStep.phone) _phoneStep(controller),
                            if (controller.step == ResidentAuthStep.otp) _otpStep(controller),
                            if (controller.step == ResidentAuthStep.society) _societyStep(controller),
                            if (controller.error != null) ...[
                              const SizedBox(height: AaraagateTokens.space4),
                              Container(
                                padding: const EdgeInsets.all(AaraagateTokens.space3),
                                decoration: BoxDecoration(
                                  color: scheme.errorContainer,
                                  borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
                                ),
                                child: Text(
                                  controller.error!,
                                  style: TextStyle(color: scheme.onErrorContainer),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: AaraagateTokens.space4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.lock_outline_rounded, size: 16, color: scheme.onSurfaceVariant),
                          const SizedBox(width: AaraagateTokens.space2),
                          Text(
                            'Secure context-scoped session',
                            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _phoneStep(ResidentAuthController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Sign in', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: AaraagateTokens.space2),
        Text('Use your Aaraagate mobile number.', style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: AaraagateTokens.space4),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Mobile number',
            prefixIcon: Icon(Icons.phone_android_rounded),
            hintText: '+91 98765 43210',
          ),
        ),
        const SizedBox(height: AaraagateTokens.space4),
        FilledButton(
          onPressed: controller.busy ? null : () => controller.requestOtp(_phone.text),
          child: controller.busy
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Send OTP'),
        ),
        const SizedBox(height: AaraagateTokens.space3),
        const Text('We’ll send a one-time password to verify your mobile number.', textAlign: TextAlign.center),
        if (controller.demoEnabled) ...[
          const SizedBox(height: AaraagateTokens.space6),
          const Row(
            children: [
              Expanded(child: Divider()),
              Padding(padding: EdgeInsets.symmetric(horizontal: AaraagateTokens.space3), child: Text('DEMO')),
              Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: AaraagateTokens.space4),
          OutlinedButton.icon(
            onPressed: controller.busy ? null : controller.enterDemo,
            icon: const Icon(Icons.play_circle_outline_rounded),
            label: const Text('Continue as Demo Resident'),
          ),
        ],
      ],
    );
  }

  Widget _otpStep(ResidentAuthController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Verify mobile', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: AaraagateTokens.space2),
        const Text('Enter the 6-digit OTP sent to your number.'),
        const SizedBox(height: AaraagateTokens.space4),
        TextField(
          controller: _otp,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autofocus: true,
          decoration: const InputDecoration(labelText: '6-digit OTP', prefixIcon: Icon(Icons.lock_outline_rounded)),
        ),
        const SizedBox(height: AaraagateTokens.space2),
        FilledButton(
          onPressed: controller.busy ? null : () => controller.verifyOtp(_otp.text),
          child: controller.busy
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Verify & continue'),
        ),
      ],
    );
  }

  Widget _societyStep(ResidentAuthController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('My Properties', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: AaraagateTokens.space2),
        const Text('Choose the exact property you want to open.'),
        const SizedBox(height: AaraagateTokens.space4),
        for (final membership in controller.memberships)
          if (membership.properties.isEmpty)
            _PropertyTile(
              membership: membership,
              busy: controller.busy,
              onTap: () => controller.selectPropertyContext(membership, null),
            )
          else
            for (final property in membership.properties)
              _PropertyTile(
                membership: membership,
                property: property,
                busy: controller.busy,
                onTap: () => controller.selectPropertyContext(membership, property),
              ),
      ],
    );
  }
}

class _PropertyTile extends StatelessWidget {
  const _PropertyTile({
    required this.membership,
    required this.busy,
    required this.onTap,
    this.property,
  });
  final SocietyMembershipOption membership;
  final PropertySummary? property;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final roleText = (membership.roles.isEmpty ? [membership.role] : membership.roles)
        .map((role) => role.replaceAll('_', ' ').toLowerCase())
        .join(', ');
    final propertyLabel = property == null
        ? membership.name
        : '${membership.name} · ${property!.buildingName} ${property!.unitNumber}'.trim();
    final relationship = property?.relationship.toLowerCase();
    return Padding(
      padding: const EdgeInsets.only(bottom: AaraagateTokens.space3),
      child: PremiumSurface(
        onTap: busy ? null : onTap,
        semanticLabel: propertyLabel,
        padding: const EdgeInsets.symmetric(
          horizontal: AaraagateTokens.space4,
          vertical: AaraagateTokens.space3,
        ),
        child: Row(
          children: [
            Container(
              width: AaraagateTokens.iconContainer,
              height: AaraagateTokens.iconContainer,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.primaryContainer,
                borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
              ),
              child: Icon(Icons.apartment_rounded, color: scheme.onPrimaryContainer),
            ),
            const SizedBox(width: AaraagateTokens.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(propertyLabel, style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: AaraagateTokens.space1),
                  Text([if (relationship != null && relationship.isNotEmpty) relationship, roleText].join(' · ')),
                ],
              ),
            ),
            const SizedBox(width: AaraagateTokens.space2),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    );
  }
}
