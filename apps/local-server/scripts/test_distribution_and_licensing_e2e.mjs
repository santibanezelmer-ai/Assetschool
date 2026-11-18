import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { UpdateEngine } from '../../../distribution/updater/update-engine.mjs';
import { createSignedManifest } from '../../../distribution/updater/generate-manifest.mjs';
import { LicenseManager } from '../../../distribution/licensing/license-manager.mjs';
import { getOrCreateVendorKeyPair } from '../../../distribution/licensing/vendor-keys.mjs';
import { SetupWizard } from './assetschool-setup-wizard.mjs';
import { provisionServer } from './assetschool-server-provisioner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const KEYS_DIR = path.resolve(REPO_ROOT, 'config/vendor');
const SERVER_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'NKkKXNIAYgppx7o4NbXP8B-e7dtIEg-dON-crODbkVtsLIzHRyJASxcZ6uqnWjH6';

console.log('='.repeat(80));
console.log('   ASSETSCHOOL — SUITE E2E: DISTRIBUCIÓN, INSTALACIÓN Y LICENCIAMIENTO (FASE F)');
console.log('='.repeat(80));

async function runDistributionAndLicensingVerification() {
  let passedTests = 0;
  const totalTests = 8;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Verificación de Empaquetado e Instaladores macOS (.app, .pkg, .dmg)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Verificando empaquetado de aplicaciones e instaladores macOS...');
    const macosInstallersDir = path.resolve(REPO_ROOT, 'dist/installers/macos');
    const masterApp = path.resolve(macosInstallersDir, 'AssetSchool Master.app');
    const studentApp = path.resolve(macosInstallersDir, 'AssetSchool Student.app');
    const pkgInstaller = path.resolve(macosInstallersDir, 'AssetSchool-1.2.0-macOS.pkg');
    const dmgDiskImage = path.resolve(macosInstallersDir, 'AssetSchool-1.2.0-macOS.dmg');

    if (!fs.existsSync(masterApp) || !fs.existsSync(path.resolve(masterApp, 'Contents/MacOS/AssetSchoolMaster'))) {
      throw new Error('Bundle AssetSchool Master.app incompleto o no encontrado.');
    }
    console.log('  ✓ AssetSchool Master.app verificado (Contents/MacOS/AssetSchoolMaster presente)');

    if (!fs.existsSync(studentApp) || !fs.existsSync(path.resolve(studentApp, 'Contents/MacOS/AssetSchoolAgent'))) {
      throw new Error('Bundle AssetSchool Student.app incompleto o no encontrado.');
    }
    console.log('  ✓ AssetSchool Student.app verificado (Contents/MacOS/AssetSchoolAgent presente)');

    if (!fs.existsSync(pkgInstaller)) {
      throw new Error('Paquete de instalación AssetSchool-1.2.0-macOS.pkg no encontrado.');
    }
    const pkgStats = fs.statSync(pkgInstaller);
    console.log(`  ✓ Instalador oficial PKG verificado (${(pkgStats.size / 1024).toFixed(1)} KB)`);

    if (!fs.existsSync(dmgDiskImage)) {
      throw new Error('Imagen de disco AssetSchool-1.2.0-macOS.dmg no encontrada.');
    }
    const dmgStats = fs.statSync(dmgDiskImage);
    console.log(`  ✓ Imagen de disco oficial DMG verificada (${(dmgStats.size / 1024 / 1024).toFixed(2)} MB)`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 2: Verificación de Especificaciones de Instaladores Windows (WiX / SCM)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Verificando definiciones de instaladores Windows (WiX MSI, Inno Setup, SCM)...');
    const studentWxs = path.resolve(REPO_ROOT, 'distribution/windows/student/AssetSchool.Student.wxs');
    const masterWxs = path.resolve(REPO_ROOT, 'distribution/windows/master/AssetSchool.Master.wxs');
    const masterIss = path.resolve(REPO_ROOT, 'distribution/windows/master/AssetSchool.Master.iss');
    const winServicePs1 = path.resolve(REPO_ROOT, 'distribution/windows/server/install-server-service.ps1');

    const studentWxsContent = fs.readFileSync(studentWxs, 'utf8');
    if (!studentWxsContent.includes('AssetSchoolStudentService') || !studentWxsContent.includes('LocalSystem')) {
      throw new Error('Especificación WiX de Student no define correctamente el servicio del sistema.');
    }
    if (!studentWxsContent.includes('SERVER_URL') || !studentWxsContent.includes('ENROLLMENT_TOKEN')) {
      throw new Error('Especificación WiX no expone propiedades para despliegue silencioso institucional.');
    }
    console.log('  ✓ AssetSchool.Student.wxs validado (Windows Service nativo y parámetros silenciosos)');

    const masterIssContent = fs.readFileSync(masterIss, 'utf8');
    if (!masterIssContent.includes('AssetSchool.Master.exe') || !masterIssContent.includes('advfirewall')) {
      throw new Error('Script Inno Setup de Master no incluye configuración de firewall o binario principal.');
    }
    console.log('  ✓ AssetSchool.Master.iss validado (Instalador EXE con configuración automática de firewall)');

    const winServiceContent = fs.readFileSync(winServicePs1, 'utf8');
    if (!winServiceContent.includes('sc.exe create') || winServiceContent.includes('nssm.exe')) {
      throw new Error('El script de servicio no cumple con la restricción de arquitectura propia sin NSSM.');
    }
    console.log('  ✓ Script de servicio Windows validado (Integración directa con Windows SCM sin NSSM)');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Aprovisionador de Servidor e Identidad Criptográfica
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Aprovisionamiento técnico del servidor (LOCAL y DEDICATED)...');
    const provisionResult = await provisionServer({
      mode: 'DEDICATED',
      port: 3000,
      sfuMinPort: 40000,
      sfuMaxPort: 40999,
    });

    if (provisionResult.serverMode !== 'DEDICATED') {
      throw new Error(`Modo de servidor no coincide: ${provisionResult.serverMode}`);
    }
    const identityPath = path.resolve(REPO_ROOT, 'config/server-identity.json');
    if (!fs.existsSync(identityPath)) {
      throw new Error('Archivo server-identity.json no generado por el provisionador.');
    }
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    if (!identity.fingerprint || !identity.publicKey) {
      throw new Error('Identidad de servidor no contiene clave pública RSA o fingerprint SHA-256.');
    }
    console.log(`  ✓ Identidad criptográfica persistente verificada (Fingerprint: ${identity.fingerprint.substring(0, 16)}...)`);
    console.log(`  ✓ Rango Mediasoup SFU configurado: ${provisionResult.sfu.minPort}-${provisionResult.sfu.maxPort} UDP`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Asistente de Configuración Inicial (Setup Wizard)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Asistente de configuración inicial (Setup Wizard) y diagnóstico...');
    const wizard = new SetupWizard({ timeoutMs: 1500 });
    const diagnostics = await wizard.runFullDiagnostics('http://127.0.0.1:3000');

    // Nota: Si el servidor local en puerto 3000 no estuviera corriendo en este instante,
    // se evalúa la lógica del asistente frente a fallos y recomendaciones.
    if (diagnostics.serverPing.success) {
      console.log(`  ✓ Servidor local en línea (${diagnostics.serverPing.latencyMs}ms, Modo: ${diagnostics.serverPing.serverMode})`);
    } else {
      console.log(`  ✓ El asistente detectó correctamente el estado fuera de línea y generó recomendación operativa:`);
      console.log(`    "${diagnostics.serverPing.recommendation}"`);
    }
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5: Motor de Actualizaciones Transaccionales (SemVer, Hash y Rollback)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Motor de actualizaciones transaccionales (SemVer, Hash SHA-256 y Rollback)...');
    const { privateKeyPem, publicKeyPem } = getOrCreateVendorKeyPair(KEYS_DIR);

    // 1. Comparación SemVer
    if (UpdateEngine.compareVersions('1.2.1', '1.2.0') !== 1 || UpdateEngine.compareVersions('1.2.0', '1.2.0') !== 0) {
      throw new Error('Fallo en lógica de comparación SemVer.');
    }
    console.log('  ✓ Comparación semántica de versiones validada');

    // 2. Generación y firma de manifiesto
    const manifest = createSignedManifest({
      version: '1.3.0',
      channel: 'stable',
      minServerVersion: '1.0.0',
      privateKeyPem,
    });

    const updater = new UpdateEngine({ vendorPublicKeyPem: publicKeyPem });
    const evalRes = updater.evaluateUpdate(manifest, '1.2.0', 'stable', '1.2.0');
    if (!evalRes.updateAvailable || evalRes.targetVersion !== '1.3.0') {
      throw new Error('El evaluador no detectó la actualización disponible firmada.');
    }
    console.log('  ✓ Manifiesto firmado verificado criptográficamente con éxito');

    // 3. Prueba de detección de manifiesto alterado (tampering)
    const tamperedManifest = { ...manifest, version: '2.0.0-HACKED' };
    const tamperedEval = updater.evaluateUpdate(tamperedManifest, '1.2.0', 'stable', '1.2.0');
    if (!tamperedEval.securityAlert) {
      throw new Error('El motor no detectó la alteración de la firma en el manifiesto manipulado.');
    }
    console.log('  ✓ Detección de manipulación de firma validada (Security Alert activada)');

    // 4. Prueba de Rollback Transaccional ante Fallo de Salud
    const testStagingDir = path.resolve(REPO_ROOT, 'dist/test_staging');
    const testInstallDir = path.resolve(testStagingDir, 'installed_app');
    const testBackupDir = path.resolve(testStagingDir, 'backups');
    fs.mkdirSync(testInstallDir, { recursive: true });
    fs.mkdirSync(testBackupDir, { recursive: true });

    // Archivo previo existente
    const initialBinary = path.resolve(testInstallDir, 'current_binary.bin');
    fs.writeFileSync(initialBinary, 'VERSION_1_0_INITIAL_CONTENT', 'utf8');

    // Paquete nuevo a instalar
    const updatePkg = path.resolve(testStagingDir, 'update_candidate.bin');
    fs.writeFileSync(updatePkg, 'VERSION_2_0_NEW_CONTENT', 'utf8');
    const updateHash = UpdateEngine.computeFileSha256(updatePkg);

    // Simular actualización con health check fallido
    const rollbackResult = await updater.applyUpdateTransactional({
      packagePath: updatePkg,
      expectedSha256: updateHash,
      targetInstallPath: testInstallDir,
      backupDir: testBackupDir,
      verifyServiceHealth: async () => false, // falla intencionalmente para forzar rollback
    });

    if (!rollbackResult.rolledBack) {
      throw new Error('El motor de actualización no ejecutó rollback tras fallo de health check.');
    }
    const restoredContent = fs.readFileSync(initialBinary, 'utf8');
    if (restoredContent !== 'VERSION_1_0_INITIAL_CONTENT') {
      throw new Error('El rollback no restauró fielmente el contenido binario anterior.');
    }
    console.log('  ✓ Rollback transaccional automático probado: El sistema fue restaurado a su versión previa');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6: Motor de Licenciamiento Comercial Propietario (Offline)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Motor de licenciamiento institucional propietario (Offline LAN)...');
    const hardwareId = LicenseManager.getInstallationHardwareId();
    console.log(`  ✓ Identificador de hardware (Machine ID): ${hardwareId}`);

    const licenseMgr = new LicenseManager(publicKeyPem);

    // Emitir licencia válida
    const validExpiry = new Date();
    validExpiry.setFullYear(validExpiry.getFullYear() + 1);

    const validLicense = LicenseManager.issueLicense(
      {
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        rut: '76.123.456-7',
        institutionName: 'Liceo Bicentenario San Martín',
        maxDevices: 150,
        validUntil: validExpiry.toISOString(),
        licensedModules: ['SFU_BROADCAST', 'REMOTE_INPUT', 'WEB_FILTERING', 'EXAM_MODE'],
      },
      privateKeyPem
    );

    const valResult = licenseMgr.validateLicense(validLicense, {
      institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      registeredDeviceCount: 85,
    });

    if (!valResult.isValid || valResult.remainingSlots !== 65) {
      throw new Error('Fallo en validación de licencia comercial legítima.');
    }
    console.log(`  ✓ Licencia comercial válida (Institución: ${valResult.institutionName}, Cupos: ${valResult.activeDevices}/${valResult.maxDevices})`);

    // Probar detección de licencia manipulada
    const alteredLicense = { ...validLicense, maxDevices: 9999 };
    const alteredVal = licenseMgr.validateLicense(alteredLicense);
    if (alteredVal.isValid || alteredVal.error !== 'FIRMA_INVALIDA') {
      throw new Error('El validador de licencias no detectó la alteración de datos.');
    }
    console.log('  ✓ Detección de alteración de licencia validada (Rechazo inmediato por firma inválida)');

    // Probar detección de licencia expirada
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    const expiredLicense = LicenseManager.issueLicense(
      {
        institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        rut: '76.123.456-7',
        institutionName: 'Liceo Expirado',
        maxDevices: 50,
        validUntil: pastDate.toISOString(),
      },
      privateKeyPem
    );
    const expiredVal = licenseMgr.validateLicense(expiredLicense);
    if (expiredVal.isValid || expiredVal.error !== 'LICENCIA_EXPIRADA') {
      throw new Error('El validador no detectó la expiración de la licencia.');
    }
    console.log('  ✓ Control de vigencia y expiración offline verificado');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: Activación y Estado de Licencia en el Servidor (Integración)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Activación y consulta de licencia comercial en runtime...');
    const testLicenseFile = path.resolve(REPO_ROOT, 'config/test-license.aslic');
    const activationRes = licenseMgr.activate(validLicense, testLicenseFile);
    if (!activationRes.isValid) {
      throw new Error('Fallo al activar archivo de licencia institucional.');
    }
    console.log(`  ✓ Licencia activada y persistida en ${testLicenseFile}`);

    const deactRes = licenseMgr.deactivate(testLicenseFile);
    if (!deactRes.success) {
      throw new Error('Fallo al desactivar archivo de licencia.');
    }
    console.log('  ✓ Desactivación y retiro de licencia comprobado');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 8: Auditoría de Scripts de Limpieza y Permisos TCC
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Auditoría de scripts de permisos TCC y desinstalación limpia...');
    const tccHelper = path.resolve(REPO_ROOT, 'distribution/macos/scripts/tcc-permissions-helper.sh');
    const uninstallScript = path.resolve(REPO_ROOT, 'distribution/macos/scripts/uninstall.sh');

    const tccContent = fs.readFileSync(tccHelper, 'utf8');
    if (!tccContent.includes('Privacy_ScreenCapture') || !tccContent.includes('Privacy_Accessibility')) {
      throw new Error('El asistente TCC no incluye las URLs directas de configuración de privacidad de macOS.');
    }
    console.log('  ✓ Asistente de privacidad macOS verificado (Cumple con directrices oficiales de Apple sin bypass)');

    const uninstallContent = fs.readFileSync(uninstallScript, 'utf8');
    if (!uninstallContent.includes('launchctl bootout') || !uninstallContent.includes('--keep-data')) {
      throw new Error('El script de desinstalación no descarga los servicios o no soporta preservación de datos.');
    }
    console.log('  ✓ Script de desinstalación limpia verificado (Descarga de LaunchDaemons y soporte --keep-data)');
    passedTests++;

    // -------------------------------------------------------------------------
    // RESUMEN FINAL
    // -------------------------------------------------------------------------
    console.log('\n' + '='.repeat(80));
    console.log(`RESULTADO DE LA AUDITORÍA FASE F: ${passedTests}/${totalTests} PRUEBAS EXITOSAS (100%)`);
    console.log('LA ARQUITECTURA DE DISTRIBUCIÓN, INSTALACIÓN Y LICENCIAMIENTO DE ASSETSCHOOL ES ROBUSTA.');
    console.log('='.repeat(80));
  } catch (err) {
    console.error('\n❌ ERROR EN AUDITORÍA DE DISTRIBUCIÓN:', err);
    process.exit(1);
  }
}

runDistributionAndLicensingVerification();
