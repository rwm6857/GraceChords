Pod::Spec.new do |s|
  s.name           = 'DifferentiateWithoutColor'
  s.version        = '1.0.0'
  s.summary        = 'Reads the iOS "Differentiate Without Color" accessibility setting.'
  s.description    = 'Local Expo module exposing UIAccessibility.shouldDifferentiateWithoutColor.'
  s.author         = 'GraceChords'
  s.homepage       = 'https://gracechords.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
