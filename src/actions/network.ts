import { action } from "@elgato/streamdeck";
import { BaseMetricAction, type MetricGroup } from "./base-metric";

@action({ UUID: "com.crest.simplestats.network" })
export class NetworkAction extends BaseMetricAction {
  protected override getDeviceGroup(): MetricGroup { return "network"; }
}
