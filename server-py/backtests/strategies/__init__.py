"""
Strategy modules. Each file exposes a `run(bars, params, ctx)` function
returning a `StrategyOutput`. Add a new strategy by:

  1. Creating <strategy_name>.py here with a `run()` function.
  2. Adding an entry to ../registry.py STRATEGIES list.

The runner in ../runner.py picks the right module by id.
"""
