using System;
using System.Runtime.InteropServices;

namespace ScheduleSync.AddIn.Interop
{
    // ── IDTExtensibility2 (COM add-in lifecycle) ────────────────────────

    public enum ext_ConnectMode
    {
        ext_cm_AfterStartup = 0,
        ext_cm_Startup = 1,
        ext_cm_External = 2,
        ext_cm_CommandLine = 3,
        ext_cm_Solution = 4,
        ext_cm_UISetup = 5
    }

    public enum ext_DisconnectMode
    {
        ext_dm_HostShutdown = 0,
        ext_dm_UserClosed = 1
    }

    /// <summary>
    /// Standard COM add-in interface for Office applications.
    /// Defined locally to avoid requiring the Extensibility GAC assembly.
    /// COM GUID: {B65AD801-ABAF-11D0-BB8B-00A0C90F2744}
    /// </summary>
    [ComImport]
    [Guid("B65AD801-ABAF-11D0-BB8B-00A0C90F2744")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDTExtensibility2
    {
        void OnConnection(
            [In, MarshalAs(UnmanagedType.IDispatch)] object Application,
            [In] ext_ConnectMode ConnectMode,
            [In, MarshalAs(UnmanagedType.IDispatch)] object AddInInst,
            [In, Out, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);

        void OnDisconnection(
            [In] ext_DisconnectMode RemoveMode,
            [In, Out, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);

        void OnAddInsUpdate(
            [In, Out, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);

        void OnStartupComplete(
            [In, Out, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);

        void OnBeginShutdown(
            [In, Out, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);
    }

    // ── Office Ribbon Interfaces ────────────────────────────────────────

    /// <summary>
    /// Office Ribbon extensibility interface.
    /// COM GUID: {000C0396-0000-0000-C000-000000000046}
    /// </summary>
    [ComImport]
    [Guid("000C0396-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
    public interface IRibbonExtensibility
    {
        [DispId(1)]
        string GetCustomUI(string RibbonID);
    }

    /// <summary>
    /// Office Ribbon UI interface for invalidating controls.
    /// COM GUID: {000C0395-0000-0000-C000-000000000046}
    /// </summary>
    [ComImport]
    [Guid("000C0395-0000-0000-C000-000000000046")]
    [InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
    public interface IRibbonUI
    {
        [DispId(1)]
        void Invalidate();

        [DispId(2)]
        void InvalidateControl([MarshalAs(UnmanagedType.BStr)] string ControlID);
    }
}
