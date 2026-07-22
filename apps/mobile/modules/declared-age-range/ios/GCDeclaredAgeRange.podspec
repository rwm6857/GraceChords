Pod::Spec.new do |s|
  # Pod/clang-module name MUST NOT be 'DeclaredAgeRange' — that is Apple's system
  # framework. A collision makes `import DeclaredAgeRange` resolve to this pod
  # instead of Apple's, so `AgeRangeService` is not in scope. Prefixed to stay
  # distinct; the JS-facing name stays "DeclaredAgeRange" via Name() in the module.
  s.name           = 'GCDeclaredAgeRange'
  s.version        = '1.0.0'
  s.summary        = 'Bridges Apple’s iOS 26 Declared Age Range API to JS.'
  s.description    = 'Local Expo module calling AgeRangeService for privacy-preserving age assurance.'
  s.author         = 'GraceChords'
  s.homepage       = 'https://gracechords.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # The DeclaredAgeRange system framework only exists on iOS 26+. Weak-link it so
  # the app still launches on older iOS (the Swift is guarded by #available).
  s.weak_frameworks = 'DeclaredAgeRange'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
