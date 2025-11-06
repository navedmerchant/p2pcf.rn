#import "P2pcfRn.h"

@implementation P2pcfRn
- (NSNumber *)multiply:(double)a b:(double)b {
    NSNumber *result = @(a * b);

    return result;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeP2pcfRnSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"P2pcfRn";
}

@end
