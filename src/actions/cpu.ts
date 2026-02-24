import { action } from "@elgato/streamdeck";
import { BaseMetricAction, type MetricGroup } from "./base-metric";

@action({ UUID: "com.crest.simplestats.cpu" })
export class CpuAction extends BaseMetricAction {
  protected override getDeviceGroup(): MetricGroup { return "cpu"; }
}
