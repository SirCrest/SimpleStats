import { action } from "@elgato/streamdeck";
import { BaseMetricAction, type MetricGroup } from "./base-metric";

@action({ UUID: "com.crest.simplestats.gpu" })
export class GpuAction extends BaseMetricAction {
  protected override getDeviceGroup(): MetricGroup { return "gpu"; }
}
