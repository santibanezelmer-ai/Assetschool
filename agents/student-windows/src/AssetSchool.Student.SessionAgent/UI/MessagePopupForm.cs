using System;
using System.Drawing;
using System.Windows.Forms;

namespace AssetSchool.Student.SessionAgent.UI;

public static class MessagePopupForm
{
    public static void ShowMessage(string title, string message, string teacherName)
    {
        var form = new Form
        {
            Text = title,
            Size = new Size(500, 300),
            StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            TopMost = true,
            BackColor = Color.FromArgb(15, 23, 42) // Slate-900
        };

        var header = new Label
        {
            Text = $"📢 {title}",
            Font = new Font("Segoe UI", 16, FontStyle.Bold),
            ForeColor = Color.FromArgb(56, 189, 248),
            Location = new Point(20, 20),
            AutoSize = true
        };
        form.Controls.Add(header);

        var senderLabel = new Label
        {
            Text = $"Enviado por: {teacherName}",
            Font = new Font("Segoe UI", 10, FontStyle.Regular),
            ForeColor = Color.FromArgb(148, 163, 184),
            Location = new Point(22, 54),
            AutoSize = true
        };
        form.Controls.Add(senderLabel);

        var textBox = new TextBox
        {
            Text = message,
            Multiline = true,
            ReadOnly = true,
            Font = new Font("Segoe UI", 12, FontStyle.Regular),
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.None,
            Location = new Point(20, 85),
            Size = new Size(440, 120)
        };
        form.Controls.Add(textBox);

        var btn = new Button
        {
            Text = "Entendido",
            DialogResult = DialogResult.OK,
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            BackColor = Color.FromArgb(2, 132, 199),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Location = new Point(340, 215),
            Size = new Size(120, 36)
        };
        btn.Click += (s, e) => form.Close();
        form.Controls.Add(btn);

        form.ShowDialog();
    }
}
