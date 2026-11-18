using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace AssetSchool.Student.Service;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = Host.CreateDefaultBuilder(args)
            .UseWindowsService(options =>
            {
                options.ServiceName = "AssetSchoolStudentService";
            })
            .ConfigureServices(services =>
            {
                services.AddHostedService<Worker>();
            });

        var host = builder.Build();
        host.Run();
    }
}
