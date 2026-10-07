import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/screens/community_circles_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('community circle messages display oldest to newest', () {
    final source = <Map<String, dynamic>>[
      {'id': 'post-3', 'body': 'Newest', 'createdAt': '2026-10-07T15:00:00Z'},
      {'id': 'post-1', 'body': 'Oldest', 'createdAt': '2026-10-07T13:00:00Z'},
      {'id': 'post-2', 'body': 'Middle', 'createdAt': '2026-10-07T14:00:00Z'},
    ];

    final ordered = orderCommunityCirclePostsForDisplay(source);

    expect(ordered.map((post) => post['body']), ['Oldest', 'Middle', 'Newest']);
    expect(source.first['body'], 'Newest', reason: 'Presentation ordering must not mutate repository data.');
  });

  test('demo community circle appends newly posted messages', () async {
    final repository = DemoResidentRepository();

    await repository.createCommunityCirclePost(circleId: 'demo-circle-1', body: 'Latest message');
    final posts = await repository.communityCirclePosts('demo-circle-1');

    expect(posts.last['body'], 'Latest message');
    expect(posts.last['mine'], isTrue);
  });
}
