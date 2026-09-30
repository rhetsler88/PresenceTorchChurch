import Capacitor
import CoreBluetooth
import Foundation

/// Background-capable BLE PTT notify listener (bluetooth-central mode).
@objc(BlePttCentralPlugin)
public class BlePttCentralPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    public let identifier = "BlePttCentralPlugin"
    public let jsName = "BlePttCentral"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var targetServiceUUID: CBUUID?
    private var targetCharUUID: CBUUID?
    private var pttHeld = false
    private var monitoring = false

    public override func load() {
        central = CBCentralManager(
            delegate: self,
            queue: .main,
            options: [CBCentralManagerOptionRestoreIdentifierKey: "PresenceTorchBlePtt"]
        )
    }

    @objc func configure(_ call: CAPPluginCall) {
        guard
            let peripheralId = call.getString("peripheralId"),
            let serviceUuid = call.getString("serviceUuid"),
            let charUuid = call.getString("characteristicUuid")
        else {
            call.reject("peripheralId, serviceUuid, and characteristicUuid are required")
            return
        }
        targetServiceUUID = CBUUID(string: serviceUuid)
        targetCharUUID = CBUUID(string: charUuid)
        let uuid = UUID(uuidString: peripheralId)
        if let uuid, let retrieved = central.retrievePeripherals(withIdentifiers: [uuid]).first {
            peripheral = retrieved
            peripheral?.delegate = self
        }
        call.resolve()
    }

    @objc func start(_ call: CAPPluginCall) {
        monitoring = true
        if central.state == .poweredOn {
            connectIfNeeded()
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        monitoring = false
        pttHeld = false
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
        call.resolve()
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard monitoring, central.state == .poweredOn else { return }
        connectIfNeeded()
    }

    public func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
            peripheral = peripherals.first
            peripheral?.delegate = self
        }
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([targetServiceUUID].compactMap { $0 })
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let serviceUUID = targetServiceUUID else { return }
        for service in peripheral.services ?? [] where service.uuid == serviceUUID {
            peripheral.discoverCharacteristics([targetCharUUID].compactMap { $0 }, for: service)
        }
    }

    public func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard error == nil, let charUUID = targetCharUUID else { return }
        for characteristic in service.characteristics ?? [] where characteristic.uuid == charUUID {
            peripheral.setNotifyValue(true, for: characteristic)
        }
    }

    public func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard error == nil, let data = characteristic.value else { return }
        let pressed = Self.parsePressed(data)
        if pressed && !pttHeld {
            pttHeld = true
            notifyListeners("pttDown", data: [:])
        } else if !pressed && pttHeld {
            pttHeld = false
            notifyListeners("pttUp", data: [:])
        }
    }

    private func connectIfNeeded() {
        guard monitoring, let peripheral else { return }
        if peripheral.state != .connected {
            central.connect(peripheral, options: nil)
        } else {
            peripheral.discoverServices([targetServiceUUID].compactMap { $0 })
        }
    }

    private static func parsePressed(_ data: Data) -> Bool {
        if data.isEmpty { return false }
        let bytes = [UInt8](data)
        if let text = String(bytes: bytes, encoding: .ascii)?.uppercased() {
            if text.contains("+PTTS=P") || text.contains("+PTT=P") { return true }
            if text.contains("+PTTS=R") || text.contains("+PTT=R") { return false }
        }
        if bytes.count >= 2 && (bytes[0] == 0x46 || bytes[0] == 0x66) {
            return (bytes[1] & 1) == 1
        }
        let holdMask: UInt8 = 0x05
        if bytes.allSatisfy({ $0 <= 0x1f }) {
            return bytes.contains { ($0 & holdMask) != 0 }
        }
        return bytes.contains { $0 != 0 }
    }
}
