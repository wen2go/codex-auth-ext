const std = @import("std");
const types = @import("../types.zig");
const common = @import("common.zig");

pub fn parse(allocator: std.mem.Allocator, args: []const [:0]const u8) !types.ParseResult {
    if (args.len == 1 and common.isHelpFlag(std.mem.sliceTo(args[0], 0))) {
        return .{ .command = .{ .help = .login } };
    }

    var opts: types.LoginOptions = .{};
    var i: usize = 0;
    while (i < args.len) : (i += 1) {
        const raw_arg = args[i];
        const arg = std.mem.sliceTo(raw_arg, 0);
        if (std.mem.eql(u8, arg, "--device-auth")) {
            if (opts.device_auth) {
                freeLoginOptions(allocator, opts);
                return common.usageErrorResult(allocator, .login, "duplicate `--device-auth` for `login`.", .{});
            }
            opts.device_auth = true;
            continue;
        }
        if (std.mem.eql(u8, arg, "--alias")) {
            if (i + 1 >= args.len) {
                freeLoginOptions(allocator, opts);
                return common.usageErrorResult(allocator, .login, "missing value for `--alias`.", .{});
            }
            if (opts.alias != null) {
                freeLoginOptions(allocator, opts);
                return common.usageErrorResult(allocator, .login, "duplicate `--alias` for `login`.", .{});
            }
            opts.alias = try allocator.dupe(u8, std.mem.sliceTo(args[i + 1], 0));
            i += 1;
            continue;
        }
        if (common.isHelpFlag(arg)) {
            freeLoginOptions(allocator, opts);
            return common.usageErrorResult(allocator, .login, "`--help` must be used by itself for `login`.", .{});
        }
        if (std.mem.startsWith(u8, arg, "-")) {
            freeLoginOptions(allocator, opts);
            return common.usageErrorResult(allocator, .login, "unknown flag `{s}` for `login`.", .{arg});
        }
        freeLoginOptions(allocator, opts);
        return common.usageErrorResult(allocator, .login, "unexpected argument `{s}` for `login`.", .{arg});
    }
    return .{ .command = .{ .login = opts } };
}

fn freeLoginOptions(allocator: std.mem.Allocator, opts: types.LoginOptions) void {
    if (opts.alias) |value| allocator.free(value);
}
